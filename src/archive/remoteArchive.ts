import { fetchDatasetResource } from '../utils/fetchDatasetResource';
import { anySignal, timeoutSignal } from '../utils/abortSignals';
import type { ZipDownloadOptions } from '../utils/zipDownload';
import { validateByteRange } from './byteSource';
import { archiveError } from './protocol';
import { assertStorageReadAccess } from '../features/storageAccess';

const METADATA_BLOCK_SIZE = 64 * 1024;
const DATA_BLOCK_SIZE = 1024 * 1024;
const RANGE_CACHE_BYTES = 4 * DATA_BLOCK_SIZE;
const REQUEST_TIMEOUT_MS = 120000;

/** Credentials stay on the main thread, under the same provider policy as full downloads. */
export function createRemoteArchiveRead(url: string, size: number, fetchImpl: ZipDownloadOptions['fetchImpl'] = fetchDatasetResource) {
  const blocks = new Map<number, Uint8Array<ArrayBuffer>>();
  let validator: string | null | undefined;
  const fetchRange = async (offset: number, length: number, signal: AbortSignal) => {
    signal.throwIfAborted();
    const response = await fetchImpl!(url, REQUEST_TIMEOUT_MS, { headers: { Range: `bytes=${offset}-${offset + length - 1}` }, signal });
    const discard = () => { void response.body?.cancel().catch(() => {}); };
    try { assertStorageReadAccess(response, url); } catch (error) { discard(); throw error; }
    if (response.status === 200 || response.status === 206 && !response.headers.get('content-range')) {
      discard(); throw archiveError('The server does not expose validated byte ranges.', 'ArchiveRangeUnsupportedError');
    }
    if (response.status === 416) {
      discard(); throw archiveError(`The host rejected a valid archive range (${offset}-${offset + length - 1} of ${size} bytes). Download the archive and open the local file, or use a host with working byte ranges.`, 'ArchiveRangeRejectedError');
    }
    if (response.status === 404 || response.status === 410) {
      discard(); throw archiveError('The archive is no longer available at this URL. Check the pinned revision or open a local copy.', 'ArchiveNotFoundError');
    }
    if (response.status !== 206) { discard(); throw new Error(`Could not read archive bytes (${response.status}).`); }
    const range = response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
    if (!range || Number(range[1]) !== offset || Number(range[2]) !== offset + length - 1 || Number(range[3]) !== size) {
      discard(); throw archiveError('Archive range response is incomplete or the file changed. Please reload.', 'ArchiveChangedError');
    }
    const currentValidator = response.headers.get('etag') ?? response.headers.get('last-modified');
    if (validator !== undefined && validator !== currentValidator) {
      discard(); throw archiveError('The archive changed while it was being read. Please reload.', 'ArchiveChangedError');
    }
    validator = currentValidator;
    if (!response.body) throw new Error('Archive range response has no body.');
    const reader = response.body.getReader();
    const bytes = new Uint8Array(length);
    let loaded = 0;
    const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        if (loaded + value.length > length) throw new Error('Archive range response exceeds its declared size.');
        bytes.set(value, loaded); loaded += value.length;
      }
      signal.throwIfAborted();
      if (loaded !== length) throw new Error('Archive range response is incomplete.');
      return bytes;
    } finally {
      signal.removeEventListener('abort', cancel);
      await reader.cancel().catch(() => {}); reader.releaseLock();
    }
  };
  return async (offset: number, length: number, inputSignal: AbortSignal): Promise<ArrayBuffer> => {
    validateByteRange(size, offset, length);
    const signal = anySignal([inputSignal, timeoutSignal(REQUEST_TIMEOUT_MS)]);
    signal.throwIfAborted();
    const result = new Uint8Array(length);
    let loaded = 0;
    while (loaded < length) {
      const position = offset + loaded;
      const blockSize = length >= 16384 ? DATA_BLOCK_SIZE : METADATA_BLOCK_SIZE;
      const blockOffset = Math.floor(position / blockSize) * blockSize;
      let block = blocks.get(blockOffset);
      if (!block || position >= blockOffset + block.length) {
        block = await fetchRange(blockOffset, Math.min(blockSize, size - blockOffset), signal);
        blocks.set(blockOffset, block);
        while ([...blocks.values()].reduce((total, value) => total + value.length, 0) > RANGE_CACHE_BYTES) {
          blocks.delete(blocks.keys().next().value!);
        }
      } else { blocks.delete(blockOffset); blocks.set(blockOffset, block); }
      const start = position - blockOffset;
      const count = Math.min(length - loaded, block.length - start);
      result.set(block.subarray(start, start + count), loaded); loaded += count;
    }
    signal.throwIfAborted();
    return result.buffer;
  };
}
