import { BufferTarget, EncodedPacketSink, EncodedVideoPacketSource, Mp4OutputFormat, Output, type EncodedPacket, type InputVideoTrack } from 'mediabunny';

export const MAX_VIDEO_GROUP_BYTES = 64 * 1024 * 1024;
const MAX_VIDEO_GROUP_PACKETS = 512;
const budgetError = () => new Error('This video needs a shorter keyframe interval for bounded browser decoding.');
const packetBytes = (packet: EncodedPacket) => packet.byteLength + (packet.sideData.alphaByteLength ?? 0);

/** Remux a bounded decode-order prefix ending at the last required packet, including B-frame dependencies. */
export async function readEncodedVideoWindow(track: InputVideoTrack, timestamp: number, frameCount: number, signal: AbortSignal) {
  signal.throwIfAborted();
  const codec = await track.getCodec(), decoderConfig = await track.getDecoderConfig();
  if (!codec || !decoderConfig) throw new Error('The video codec configuration is unavailable.');
  const sink = new EncodedPacketSink(track);
  const targetPacket = await sink.getPacket(timestamp, { metadataOnly: true });
  const firstMetadata = await sink.getKeyPacket(timestamp, { metadataOnly: true });
  if (firstMetadata && packetBytes(firstMetadata) > MAX_VIDEO_GROUP_BYTES) throw budgetError();
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
  // Reject oversized groups from metadata before reading their remaining payloads.
  // The first packet is already read to verify that it really is a keyframe.
  const prefix = [];
  let metadata: EncodedPacket | null = first, bytes = 0, frameIndex = 0;
  while (metadata && metadata.sequenceNumber <= last.sequenceNumber) {
    signal.throwIfAborted();
    bytes += packetBytes(metadata);
    if (bytes > MAX_VIDEO_GROUP_BYTES || prefix.length >= MAX_VIDEO_GROUP_PACKETS) throw budgetError();
    prefix.push(metadata);
    if (metadata.timestamp >= first.timestamp && metadata.timestamp < targetPacket.timestamp) frameIndex++;
    if (metadata.sequenceNumber === last.sequenceNumber) break;
    metadata = await sink.getNextPacket(metadata, { metadataOnly: true });
  }
  if (prefix.at(-1)?.sequenceNumber !== last.sequenceNumber) throw new Error('The video keyframe group is incomplete.');
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const packets = new EncodedVideoPacketSource(codec);
  output.addVideoTrack(packets, { rotation: await track.getRotation() });
  await output.start();
  try {
    let packet: EncodedPacket | null = first;
    for (const expected of prefix) {
      signal.throwIfAborted();
      if (expected !== first) packet = await sink.getNextPacket(packet!);
      if (!packet || packet.sequenceNumber !== expected.sequenceNumber || packetBytes(packet) !== packetBytes(expected)) throw new Error('The video packet differs from its index.');
      await packets.add(packet.clone({ timestamp: packet.timestamp - first.timestamp }), { decoderConfig });
    }
    await output.finalize();
  } catch (error) { await output.cancel(); throw error; }
  signal.throwIfAborted();
  if (!target.buffer || target.buffer.byteLength > MAX_VIDEO_GROUP_BYTES + 1024 * 1024) throw new Error('Video keyframe group exceeds its decode budget.');
  return { data: new Uint8Array(target.buffer), frameIndex, frames: frames.map(({ timestamp, duration }) => ({ timestamp, duration })) };
}
