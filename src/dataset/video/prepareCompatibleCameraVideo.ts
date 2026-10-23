import { BlobSource, Input, MP4 } from 'mediabunny';
import { anySignal } from '../../utils/abortSignals';
import { createSoftwareVideoDecoder } from './softwareVideoDecoder';
import { queueVideoPlayback } from './videoFrameQueue';
import { MAX_CACHED_VIDEO_BYTES, type VideoImageBinding } from './types';

/** Convert the selected clip once, then let the browser play and seek its cached MP4. */
export async function prepareCompatibleCameraVideo(blob: Blob, source: VideoImageBinding, duration: number,
  ownerSignal: AbortSignal, onProgress: (percent: number) => void): Promise<Blob> {
  const interruption = new AbortController(), signal = anySignal([ownerSignal, interruption.signal]);
  signal.throwIfAborted();
  if (blob.size > MAX_CACHED_VIDEO_BYTES) throw new Error('This video exceeds the 256 MiB playback cache limit.');
  const scale = Math.min(1, 1280 / Math.max(source.width, source.height));
  const width = Math.max(2, Math.floor(source.width * scale / 2) * 2), height = Math.max(2, Math.floor(source.height * scale / 2) * 2);
  const file = await queueVideoPlayback({ signal, getPriority: () => 'selected' }, async () => {
    const decoder = await createSoftwareVideoDecoder(signal);
    try {
      const { ffmpeg } = decoder;
      ffmpeg.on('progress', ({ progress }) => onProgress(Math.min(99, Math.max(0, Math.round(progress * 100)))));
      await ffmpeg.writeFile('source.video', new Uint8Array(await blob.arrayBuffer()), { signal });
      const exit = await ffmpeg.exec(['-nostdin', '-threads', '1', '-max_alloc', '134217728', '-copyts', '-i', 'source.video',
        '-map', '0:v:0', '-an', '-vf', `scale=${width}:${height}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20',
        '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-threads', '1', '-avoid_negative_ts', 'disabled',
        '-movflags', '+faststart', '-fs', String(MAX_CACHED_VIDEO_BYTES), 'playback.mp4'], 180000, { signal });
      signal.throwIfAborted();
      if (exit !== 0) throw new Error('This video could not be prepared for browser playback.');
      const data = await ffmpeg.readFile('playback.mp4', undefined, { signal });
      if (typeof data === 'string' || data.byteLength > MAX_CACHED_VIDEO_BYTES) throw new Error('Prepared video exceeds the playback cache limit.');
      return new File([new Uint8Array(data)], 'playback.mp4', { type: 'video/mp4' });
    } finally { decoder.dispose(); }
  }, () => interruption.abort(new Error('Video preparation paused while loading images. Try again.')));
  signal.throwIfAborted();
  if (!file) throw new Error('Video preparation was canceled.');
  const input = new Input({ source: new BlobSource(file), formats: [MP4] });
  try {
    const track = await input.getPrimaryVideoTrack(), preparedDuration = await track?.computeDuration();
    if (!preparedDuration || Math.abs(preparedDuration - duration) > Math.max(0.1, duration * 0.001)) throw new Error('The prepared video is incomplete.');
  } finally { input.dispose(); }
  signal.throwIfAborted(); onProgress(100);
  return file;
}
