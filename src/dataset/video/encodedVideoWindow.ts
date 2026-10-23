import { BufferTarget, EncodedPacketSink, EncodedVideoPacketSource, Mp4OutputFormat, Output, type InputVideoTrack } from 'mediabunny';

export const MAX_VIDEO_GROUP_BYTES = 64 * 1024 * 1024;
const MAX_VIDEO_GROUP_PACKETS = 512;

/** Remux a bounded decode-order prefix ending at the last required packet, including B-frame dependencies. */
export async function readEncodedVideoWindow(track: InputVideoTrack, timestamp: number, frameCount: number, signal: AbortSignal) {
  signal.throwIfAborted();
  const codec = await track.getCodec(), decoderConfig = await track.getDecoderConfig();
  if (!codec || !decoderConfig) throw new Error('The video codec configuration is unavailable.');
  const sink = new EncodedPacketSink(track);
  const targetPacket = await sink.getPacket(timestamp, { metadataOnly: true });
  const first = await sink.getKeyPacket(timestamp, { verifyKeyPackets: true });
  if (!targetPacket || !first) throw new Error('No independently decodable video frame exists at this timestamp.');
  const frames = [targetPacket];
  while (frames.length < frameCount) {
    signal.throwIfAborted();
    const previous = frames.at(-1)!;
    if (previous.duration <= 0) break;
    const next = await sink.getPacket(previous.timestamp + previous.duration + 1e-7, { metadataOnly: true });
    if (!next || next.timestamp <= previous.timestamp) break;
    frames.push(next);
  }
  // Presentation order differs from decode order. Every selected packet must be included.
  const last = frames.reduce((latest, packet) => packet.sequenceNumber > latest.sequenceNumber ? packet : latest);
  const end = await sink.getNextPacket(last, { metadataOnly: true });
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const packets = new EncodedVideoPacketSource(codec);
  output.addVideoTrack(packets, { rotation: await track.getRotation() });
  await output.start();
  let bytes = 0, count = 0, frameIndex = 0;
  try {
    for await (const packet of sink.packets(first, end ?? undefined)) {
      signal.throwIfAborted();
      bytes += packet.byteLength;
      if (bytes > MAX_VIDEO_GROUP_BYTES || ++count > MAX_VIDEO_GROUP_PACKETS) throw new Error('This video needs a shorter keyframe interval for bounded browser decoding.');
      if (packet.timestamp >= first.timestamp && packet.timestamp < targetPacket.timestamp) frameIndex++;
      await packets.add(packet.clone({ timestamp: packet.timestamp - first.timestamp }), { decoderConfig });
    }
    await output.finalize();
  } catch (error) { await output.cancel(); throw error; }
  signal.throwIfAborted();
  if (!target.buffer || target.buffer.byteLength > MAX_VIDEO_GROUP_BYTES + 1024 * 1024) throw new Error('Video keyframe group exceeds its decode budget.');
  return { data: new Uint8Array(target.buffer), frameIndex, frames: frames.map(({ timestamp, duration }) => ({ timestamp, duration })) };
}
