import { FFmpeg } from '@ffmpeg/ffmpeg';
import workerURL from '@ffmpeg/ffmpeg/worker?worker&url';
import coreURL from '@ffmpeg/core?url';
import compressedWasmURL from 'virtual:video-decoder-wasm';

/** The optional worker receives bounded encoded data only, never source URLs or credentials. */
export async function createSoftwareVideoDecoder(signal: AbortSignal) {
  signal.throwIfAborted();
  const ffmpeg = new FFmpeg();
  let wasmURL: string | undefined;
  const cancel = () => ffmpeg.terminate();
  const dispose = () => {
    signal.removeEventListener('abort', cancel);
    ffmpeg.terminate();
    if (wasmURL) { URL.revokeObjectURL(wasmURL); wasmURL = undefined; }
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetch(compressedWasmURL, { signal, credentials: 'omit' });
    if (!response.ok || !response.body) throw new Error('Could not load the optional video decoder.');
    const wasm = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).blob();
    signal.throwIfAborted();
    wasmURL = URL.createObjectURL(wasm);
    await ffmpeg.load({ coreURL, wasmURL, classWorkerURL: workerURL }, { signal });
    signal.throwIfAborted();
    return { ffmpeg, dispose };
  } catch (error) { dispose(); throw error; }
}
