import { beforeEach, expect, it, vi } from 'vitest';
import { EncodedPacket, EncodedPacketSink, Output, type InputVideoTrack } from 'mediabunny';
import { MAX_VIDEO_GROUP_BYTES, readEncodedVideoWindow } from './encodedVideoWindow';

vi.mock('mediabunny', async importOriginal => {
  const actual = await importOriginal<typeof import('mediabunny')>();
  return { ...actual, EncodedPacketSink: vi.fn(), Output: vi.fn() };
});
beforeEach(() => vi.clearAllMocks());

const track = { getCodec: async () => 'avc', getDecoderConfig: async () => ({}), getRotation: async () => 0 } as unknown as InputVideoTrack;
const packet = (index: number, bytes = 1, alpha = 0) => new EncodedPacket(new Uint8Array(), index ? 'delta' : 'key', index, 1, index, bytes, { alphaByteLength: alpha });

it.each(['bytes', 'alpha', 'packets'] as const)('rejects a group exceeding its %s budget before reading its remaining payloads', async limit => {
  const last = limit === 'packets' ? 512 : 1;
  const first = new EncodedPacket(new Uint8Array([1]), 'key', 0, 1, 0);
  const getNextPacket = vi.fn(async (previous: EncodedPacket, options?: { metadataOnly?: boolean }) => {
    expect(options?.metadataOnly).toBe(true);
    return packet(previous.sequenceNumber + 1, limit === 'bytes' ? MAX_VIDEO_GROUP_BYTES : 1, limit === 'alpha' ? MAX_VIDEO_GROUP_BYTES : 0);
  });
  vi.mocked(EncodedPacketSink).mockImplementation(function () {
    return { getPacket: async () => packet(last), getKeyPacket: async () => first, getNextPacket } as unknown as EncodedPacketSink;
  });
  await expect(readEncodedVideoWindow(track, last, 1, new AbortController().signal)).rejects.toThrow('shorter keyframe interval');
  expect(getNextPacket).toHaveBeenCalled();
  expect(Output).not.toHaveBeenCalled();
});

it('rejects an oversized first packet from metadata without requesting its payload', async () => {
  const getKeyPacket = vi.fn(async () => packet(0, MAX_VIDEO_GROUP_BYTES + 1));
  vi.mocked(EncodedPacketSink).mockImplementation(function () {
    return { getPacket: async () => packet(0), getKeyPacket } as unknown as EncodedPacketSink;
  });
  await expect(readEncodedVideoWindow(track, 0, 1, new AbortController().signal)).rejects.toThrow('shorter keyframe interval');
  expect(getKeyPacket).toHaveBeenCalledExactlyOnceWith(0, { metadataOnly: true });
});
