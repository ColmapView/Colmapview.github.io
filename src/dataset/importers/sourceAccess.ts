import { fetchDatasetResource } from '../../utils/fetchDatasetResource';
import { imageResourceUrl, leafPath } from './sourcePaths';
import { importError, type CameraDatasetSource } from './types';

export const MAX_CAMERA_MEDIA_BYTES = 64 * 1024 * 1024;

/** Bound actual streamed bytes, including hosts that hide or misreport Content-Length. */
export async function readBoundedResponseBytes(response: Response, name: string, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>[]> {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    return importError('IMPORT_LIMIT_EXCEEDED',`${name} exceeds the ${Math.round(maxBytes/1024/1024)} MiB read budget.`);
  }
  if (!response.body) return importError('SOURCE_ACCESS_FAILED',`No response body for ${name}.`);
  const reader=response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[]=[];
  let total=0;
  const cancel=() => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener('abort',cancel,{ once:true });
  try {
    for (;;) {
      signal?.throwIfAborted();
      const {done,value}=await reader.read();
      if (done) break;
      total+=value.byteLength;
      if (total > maxBytes) return importError('IMPORT_LIMIT_EXCEEDED',`${name} exceeds its read budget.`);
      chunks.push(new Uint8Array(value));
    }
    signal?.throwIfAborted();
    return chunks;
  } finally {
    signal?.removeEventListener('abort',cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function readBoundedResponseFile(response: Response, name: string, maxBytes: number, signal?: AbortSignal): Promise<File> {
  const chunks = await readBoundedResponseBytes(response, name, maxBytes, signal);
  return new File(chunks, name, { type: response.headers.get('content-type') ?? 'application/octet-stream' });
}

export async function readCameraSourceFile(source: CameraDatasetSource, path: string, signal?: AbortSignal,
  maxBytes=MAX_CAMERA_MEDIA_BYTES): Promise<File|null> {
  signal?.throwIfAborted();
  let file: File|null;
  if (source.kind==='local') file=source.files.get(path) ?? null;
  else if (source.kind==='archive') {
    const entry=source.entries.get(path);
    if (!entry) return null;
    if (entry.size > maxBytes) return importError('IMPORT_LIMIT_EXCEEDED',`${path} exceeds its read budget.`);
    file=await entry.extract({ signal });
  } else {
    const response=await fetchDatasetResource(imageResourceUrl(source.baseUrl,path),undefined,{ signal });
    if (response.status===404 || response.status===410) { await response.body?.cancel().catch(() => {}); return null; }
    if (!response.ok) { await response.body?.cancel().catch(() => {}); return importError('SOURCE_ACCESS_FAILED',`HTTP ${response.status}: could not read ${path}.`); }
    file=await readBoundedResponseFile(response,leafPath(path),maxBytes,signal);
  }
  signal?.throwIfAborted();
  if (file && file.size > maxBytes) return importError('IMPORT_LIMIT_EXCEEDED',`${path} exceeds its read budget.`);
  return file;
}
