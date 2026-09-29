import { HfError, boundedFetch } from '../huggingface/http';
import { createTransferTimeout } from '../huggingface/transferTimeout';

/** Downloads while bytes keep arriving; only a stalled transfer times out. */
export async function downloadRemoteFile(url: string, path: string, signal: AbortSignal, maxBytes = Infinity): Promise<Blob> {
  signal.throwIfAborted();
  const transfer = createTransferTimeout(signal);
  const tooLarge = () => new HfError(`The file ${path} exceeds the ${Math.round(maxBytes / 1024 / 1024)} MiB publication limit for non-splat files.`);
  try {
    const response = await boundedFetch(transfer.signal, null)(url);
    transfer.activity();
    if (!response.ok || !response.body) throw new HfError(`Could not retrieve selected file ${path} (${response.status}).`);
    if (Number(response.headers.get('content-length')) > maxBytes) {
      await response.body.cancel();
      throw tooLarge();
    }
    let received = 0;
    // Let the browser build its Blob storage without retaining JS chunk arrays
    // or allocating an ArrayBuffer the size of the entire remote file.
    const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > maxBytes) throw tooLarge();
        transfer.activity(); controller.enqueue(chunk);
      },
    }), { signal: transfer.signal });
    const content = await new Response(stream).blob();
    transfer.signal.throwIfAborted();
    return content;
  } finally { transfer.dispose(); }
}
