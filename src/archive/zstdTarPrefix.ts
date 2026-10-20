import { Decompress } from 'fzstd';
import { createArchiveByteSource } from './byteSource';
import { IndexedTarBackend } from './indexedTar';
import { MAX_GEOMETRY_MEMBER_BYTES, MAX_GEOMETRY_PREFIX_BYTES, MAX_TAR_PREFIX_METADATA_BYTES, MAX_ZSTD_WINDOW_BYTES } from './geometryLimits';

function checkFrameWindow(bytes: Uint8Array): void {
  if (bytes.length < 18 || bytes[0] !== 0x28 || bytes[1] !== 0xb5 || bytes[2] !== 0x2f || bytes[3] !== 0xfd || bytes[4] & 8) {
    throw new Error('Expected a standard Zstandard frame header.');
  }
  const descriptor = bytes[4], single = Boolean(descriptor & 32);
  const dictionaryBytes = [0, 1, 2, 4][descriptor & 3];
  let offset = single ? 5 : 6;
  if (bytes.subarray(offset, offset + dictionaryBytes).some(byte => byte !== 0)) throw new Error('External Zstandard dictionaries are not supported.');
  offset += dictionaryBytes;
  const sizeBytes = [single ? 1 : 0, 2, 4, 8][descriptor >>> 6];
  let size = 0n;
  for (let index = sizeBytes - 1; index >= 0; index--) size = size * 256n + BigInt(bytes[offset + index]);
  if (sizeBytes === 2) size += 256n;
  const window = single ? size : BigInt(2 ** (10 + (bytes[5] >>> 3))) * BigInt(8 + (bytes[5] & 7)) / 8n;
  if (window > BigInt(MAX_ZSTD_WINDOW_BYTES)) throw new Error('Zstandard frame window exceeds the selected-frame memory budget.');
}

function canonicalMember(path: string): string {
  const normalized = path.replace(/^(\.\/)+/, '');
  if (!normalized || /[\\?#]/.test(normalized) || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Unsafe geometry archive member path.');
  }
  return normalized;
}

/** Decode a checked prefix; member integrity does not depend on an unfinished archive checksum. */
export async function extractZstdTarPrefix(source: File, memberPath: string, memberBytes: number, signal: AbortSignal): Promise<File> {
  signal.throwIfAborted();
  if (source.size < 18 || source.size > MAX_GEOMETRY_PREFIX_BYTES || !Number.isSafeInteger(memberBytes)
    || memberBytes <= 0 || memberBytes > MAX_GEOMETRY_MEMBER_BYTES) throw new Error('Selected archive frame exceeds its read budget.');
  const expected = canonicalMember(memberPath);
  const compressed = new Uint8Array(await source.arrayBuffer());
  signal.throwIfAborted();
  checkFrameWindow(compressed);
  const limit = memberBytes + MAX_TAR_PREFIX_METADATA_BYTES;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  const stop = new Error('Selected prefix decoded');
  const decoder = new Decompress(chunk => {
    const part = new Uint8Array(chunk.subarray(0, limit - loaded));
    if (part.length) { chunks.push(part); loaded += part.length; }
    if (loaded >= limit) throw stop;
  });
  try { decoder.push(compressed, false); }
  catch (error) { if (error !== stop) throw error; }
  signal.throwIfAborted();
  const tar = new File(chunks, 'selected-prefix.tar');
  const reader = new IndexedTarBackend(createArchiveByteSource(tar, async () => { throw new Error('Unexpected remote TAR read.'); }));
  try {
    const [first] = await reader.list(signal, true);
    if (!first || canonicalMember(first.path) !== expected || first.size !== memberBytes) {
      throw new Error('The selected geometry must be the complete first regular TAR member.');
    }
    return await reader.extract(first.path, signal);
  } finally { await reader.close(); }
}

