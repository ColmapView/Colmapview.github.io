import { HfError } from '../huggingface/http';
import { awaitWithAbort } from '../../utils/awaitWithAbort';

type Request = (url: string, init?: RequestInit) => Promise<Response>;

/** Check the object size and ZIP signature without downloading an archive-sized response. */
export async function verifyPublicationZip(url: string, size: number, request: Request, signal: AbortSignal) {
  signal.throwIfAborted();
  const head = await request(url, { method: 'HEAD', signal });
  if (!head.ok || head.headers.get('content-length') !== String(size)) {
    throw new HfError('The uploaded ZIP size could not be verified.');
  }
  const response = await request(url, { headers: { Range: 'bytes=0-3' }, signal });
  const reader = response.body?.getReader();
  try {
    if (!response.ok || !reader) throw new HfError('The uploaded ZIP could not be read.');
    const signature = new Uint8Array(4);
    let loaded = 0;
    while (loaded < signature.length) {
      const { done, value } = await awaitWithAbort(reader.read(), signal);
      if (done) throw new HfError('The uploaded ZIP is incomplete.');
      const bytes = value.subarray(0, signature.length - loaded);
      signature.set(bytes, loaded); loaded += bytes.length;
    }
    signal.throwIfAborted();
    if (signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 3 || signature[3] !== 4) {
      throw new HfError('The uploaded file is not the prepared ZIP archive.');
    }
  } finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
}
