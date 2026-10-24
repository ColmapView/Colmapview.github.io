import { BufferTarget, EncodedPacketSink, EncodedVideoPacketSource, Mp4OutputFormat, Output, WebMOutputFormat,
  type InputVideoTrack } from 'mediabunny';
import { MAX_CACHED_VIDEO_BYTES } from './types';

/** Change only container timing; preserve every encoded picture and its decode order. */
export async function retimeCameraVideo(track: InputVideoTrack, mimeType: string, rate: number, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!Number.isFinite(rate) || rate < 0.0625 || rate > 120) throw new Error('Invalid camera video playback rate.');
  const config = await track.getDecoderConfig();
  if (!track.codec || !config) throw new Error('This video has no usable codec configuration.');
  const target = new BufferTarget();
  target.on('write', ({ end }) => {
    if (end > MAX_CACHED_VIDEO_BYTES) throw new Error('Prepared video exceeds the playback cache limit.');
  });
  const format = mimeType === 'video/webm' ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' });
  const output = new Output({ format, target });
  const packets = new EncodedVideoPacketSource(track.codec);
  output.addVideoTrack(packets, { decoderConfig: config, transformationMatrix: await track.getTransformationMatrix() });
  try {
    await output.start();
    let count = 0;
    for await (const packet of new EncodedPacketSink(track).packets()) {
      signal.throwIfAborted();
      if (++count > 250000 || packet.byteLength + (packet.sideData.alphaByteLength ?? 0) > 64 * 1024 * 1024) throw new Error('Video exceeds the playback packet budget.');
      await packets.add(packet.clone({ timestamp: packet.timestamp / rate, duration: packet.duration / rate }));
    }
    signal.throwIfAborted();
    if (!count) throw new Error('The video has no playable frames.');
    packets.close();
    await output.finalize();
    signal.throwIfAborted();
    return new Blob([target.buffer!], { type: format.mimeType });
  } finally {
    if (output.state !== 'finalized') await output.cancel();
  }
}
