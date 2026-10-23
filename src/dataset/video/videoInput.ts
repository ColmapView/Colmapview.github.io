import { CustomSource, Input, MP4, WEBM } from 'mediabunny';
import { createRemoteArchiveRead } from '../../archive/remoteArchive';
import type { VideoImageBinding } from './types';

/** A single bounded range cache; avoid a second demuxer cache retaining merged video ranges. */
export function createVideoInput(binding: VideoImageBinding, signal: AbortSignal) {
  signal.throwIfAborted();
  const read = createRemoteArchiveRead(binding.url, binding.bytes);
  const input = new Input({ formats: [MP4, WEBM], source: new CustomSource({
    getSize: () => binding.bytes,
    read: async (start, end) => {
      if (end - start > 64 * 1024 * 1024) throw new Error('Video read exceeds the 64 MiB encoded-data budget.');
      return new Uint8Array(await read(start, end - start, signal));
    },
    maxCacheSize: 0,
    prefetchProfile: 'none',
  }) });
  const cancel = () => input.dispose();
  signal.addEventListener('abort', cancel, { once: true });
  return {
    input,
    dispose() { signal.removeEventListener('abort', cancel); cancel(); },
  };
}

export async function readVideoTrack(input: Input, binding: VideoImageBinding, signal: AbortSignal) {
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('The video has no video track.');
  const width = await track.getDisplayWidth(), height = await track.getDisplayHeight();
  if (width * height > 16_000_000) throw new Error('Video dimensions exceed the 16 million pixel decode budget.');
  if (width !== binding.width || height !== binding.height) throw new Error('Video dimensions do not match camera calibration.');
  const duration = await track.computeDuration();
  signal.throwIfAborted();
  if (!Number.isFinite(duration) || duration <= 0 || binding.timestamp >= duration) throw new Error('The matched frame is outside the video.');
  return { track, duration };
}
