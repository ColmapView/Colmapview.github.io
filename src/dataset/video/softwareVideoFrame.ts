import { BufferTarget, EncodedPacketSink, EncodedVideoPacketSource, Mp4OutputFormat, Output, type InputVideoTrack } from 'mediabunny';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import workerURL from '@ffmpeg/ffmpeg/worker?worker&url';
import coreURL from '@ffmpeg/core?url';
import compressedWasmURL from 'virtual:video-decoder-wasm';

const MAX_GOP_BYTES = 64 * 1024 * 1024;
const MAX_GOP_PACKETS = 512;

/** Software fallback is a separate, on-demand Worker. It receives one bounded GOP, never a URL. */
export async function decodeSoftwareVideoFrame(track: InputVideoTrack, timestamp: number, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  const codec = await track.getCodec(), decoderConfig = await track.getDecoderConfig();
  if (!codec || !decoderConfig) throw new Error('The video codec configuration is unavailable.');
  const sink = new EncodedPacketSink(track);
  const targetPacket = await sink.getPacket(timestamp, { metadataOnly: true });
  const first = await sink.getKeyPacket(timestamp, { verifyKeyPackets: true });
  if (!targetPacket || !first) throw new Error('No independently decodable video frame exists at this timestamp.');
  const end = await sink.getNextKeyPacket(first, { metadataOnly: true });
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const packets = new EncodedVideoPacketSource(codec);
  output.addVideoTrack(packets, { rotation: await track.getRotation() });
  await output.start();
  let bytes = 0, count = 0;
  try {
    for await (const packet of sink.packets(first, end ?? undefined)) {
      signal.throwIfAborted();
      bytes += packet.byteLength;
      if (bytes > MAX_GOP_BYTES || ++count > MAX_GOP_PACKETS) throw new Error('This video needs a shorter keyframe interval for bounded browser decoding.');
      await packets.add(packet.clone({ timestamp: packet.timestamp - first.timestamp }), { decoderConfig });
    }
    await output.finalize();
  } catch (error) { await output.cancel(); throw error; }
  signal.throwIfAborted();
  if (!target.buffer || target.buffer.byteLength > MAX_GOP_BYTES + 1024 * 1024) throw new Error('Video keyframe group exceeds its decode budget.');
  const ffmpeg = new FFmpeg();
  let wasmURL: string | undefined;
  const cancel = () => ffmpeg.terminate();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetch(compressedWasmURL, { signal, credentials: 'omit' });
    if (!response.ok || !response.body) throw new Error('Could not load the optional video decoder.');
    const wasm = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).blob();
    signal.throwIfAborted();
    wasmURL = URL.createObjectURL(wasm);
    await ffmpeg.load({ coreURL, wasmURL, classWorkerURL: workerURL }, { signal });
    signal.throwIfAborted();
    await ffmpeg.writeFile('input.mp4', new Uint8Array(target.buffer), { signal });
    const offset = (targetPacket.timestamp - first.timestamp).toFixed(9);
    const exit = await ffmpeg.exec(['-nostdin', '-threads', '1', '-max_alloc', '134217728', '-i', 'input.mp4',
      '-ss', offset, '-frames:v', '1', '-threads', '1', '-f', 'image2', 'frame.png'], 60000, { signal });
    signal.throwIfAborted();
    if (exit !== 0) throw new Error('The software decoder could not extract this video frame.');
    const data = await ffmpeg.readFile('frame.png', undefined, { signal });
    if (typeof data === 'string') throw new Error('The software decoder returned an invalid image.');
    return new Blob([new Uint8Array(data)], { type: 'image/png' });
  } finally {
    signal.removeEventListener('abort', cancel);
    ffmpeg.terminate();
    if (wasmURL) URL.revokeObjectURL(wasmURL);
  }
}
