import { Blob as NodeBlob } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BlobSource, EncodedPacketSink, Input, MP4, WEBM } from 'mediabunny';
import { retimeCameraVideo } from './retimeCameraVideo';

beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => vi.unstubAllGlobals());

it.each(['colors.mp4', 'bframes.mp4', 'vfr.webm'])('retimes %s without changing encoded frames, presentation order or geometry', async name => {
  const original = new Input({ source: new BlobSource(new Blob([await readFile(`e2e/fixtures/video-frames/${name}`)])), formats: [MP4, WEBM] });
  let result: Input | undefined;
  try {
    const track = (await original.getPrimaryVideoTrack())!;
    const blob = await retimeCameraVideo(track, (await original.getFormat()).mimeType, 30, new AbortController().signal);
    result = new Input({ source: new BlobSource(blob), formats: [MP4, WEBM] });
    const retimed = (await result.getPrimaryVideoTrack())!;
    expect(await retimed.getDisplayWidth()).toBe(await track.getDisplayWidth());
    expect(await retimed.getDisplayHeight()).toBe(await track.getDisplayHeight());
    // WebM has millisecond timestamps and infers the last packet's duration.
    expect(await retimed.computeDuration()).toBeCloseTo(await track.computeDuration() / 30, 2);
    const sourcePackets = new EncodedPacketSink(track).packets();
    let count = 0;
    for await (const packet of new EncodedPacketSink(retimed).packets()) {
      const source = (await sourcePackets.next()).value!;
      expect(packet.data).toEqual(source.data);
      expect(packet.timestamp).toBeCloseTo(source.timestamp / 30, 2);
      expect(packet.duration).toBeCloseTo(source.duration / 30, 2);
      count++;
    }
    expect(count).toBeGreaterThan(0);
    expect((await sourcePackets.next()).done).toBe(true);
  } finally { original.dispose(); result?.dispose(); }
});

it('settles canceled work before reading the track', async () => {
  const owner = new AbortController(); owner.abort();
  await expect(retimeCameraVideo(null!, 'video/mp4', 30, owner.signal)).rejects.toMatchObject({ name: 'AbortError' });
});
