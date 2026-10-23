import { BlobSource, Input, MP4, WEBM } from 'mediabunny';
import { anySignal } from '../../utils/abortSignals';
import { downloadZip, releaseArchiveDownload } from '../../utils/zipDownload';
import { readVideoTrack } from './videoInput';
import { MAX_CACHED_VIDEO_BYTES, type CameraVideoSource } from './types';

export interface CameraVideoProgress { phase: 'download' | 'prepare'; percent: number }

/** Attach listeners before loading/seeking, and settle every aborted or failed attempt. */
function mediaEvent(video: HTMLVideoElement, event: 'loadeddata' | 'seeked', signal: AbortSignal, run: () => void) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer); video.removeEventListener(event, done); video.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('This browser could not decode the cached video.')); };
    const aborted = () => { cleanup(); reject(signal.reason); };
    const timer = setTimeout(failed, 20000);
    video.addEventListener(event, done, { once: true }); video.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', aborted, { once: true });
    try { run(); } catch (error) { cleanup(); reject(error); }
  });
}

/** One selected recording, retained across pause/seek and released with this image detail. */
export async function loadCachedCameraVideo(source: CameraVideoSource, video: HTMLVideoElement, options: {
  signal: AbortSignal;
  onProgress(progress: CameraVideoProgress): void;
}) {
  const signal = anySignal([source.signal, options.signal]);
  // React's same-turn development cleanup must not start a throwaway download.
  await Promise.resolve();
  signal.throwIfAborted();
  if (source.bytes > MAX_CACHED_VIDEO_BYTES) throw new Error('This video exceeds the 256 MiB playback cache limit.');
  let original: Blob | undefined, url: string | undefined;
  let cleanup = Promise.resolve();
  const detach = () => {
    if (!url) return;
    if (video.getAttribute('src') === url) { video.pause(); video.removeAttribute('src'); video.load(); }
    URL.revokeObjectURL(url); url = undefined;
  };
  const releaseOriginal = () => {
    if (original) {
      const blob = original; original = undefined;
      cleanup = cleanup.catch(() => {}).then(() => releaseArchiveDownload(blob));
    }
    return cleanup;
  };
  const dispose = () => { detach(); return releaseOriginal(); };
  const cancel = () => { void dispose().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const attach = async (blob: Blob) => {
    signal.throwIfAborted(); detach(); url = URL.createObjectURL(blob);
    await mediaEvent(video, 'loadeddata', signal, () => { video.src = url!; video.load(); });
  };
  try {
    original = await downloadZip(source.url, progress => options.onProgress({ phase: 'download',
      percent: Math.min(100, Math.round((progress.bytesLoaded ?? 0) / source.bytes * 100)) }),
    { signal, expectedSize: source.bytes, sizeLimit: MAX_CACHED_VIDEO_BYTES });
    signal.throwIfAborted();
    const input = new Input({ source: new BlobSource(original), formats: [MP4, WEBM] });
    const abortInput = () => input.dispose();
    signal.addEventListener('abort', abortInput, { once: true });
    let duration: number, mimeType: string;
    try {
      ({ duration } = await readVideoTrack(input, source, signal));
      const track = (await input.getPrimaryVideoTrack())!, codec = (await track.getDecoderConfig())?.codec;
      mimeType = `${(await input.getFormat()).mimeType}${codec ? `; codecs="${codec}"` : ''}`;
    } finally { signal.removeEventListener('abort', abortInput); input.dispose(); }
    let convert = !video.canPlayType(mimeType);
    if (!convert) {
      try { await attach(original); }
      catch { signal.throwIfAborted(); convert = true; }
    }
    if (convert) {
      detach(); options.onProgress({ phase: 'prepare', percent: 0 });
      const { prepareCompatibleCameraVideo } = await import('./prepareCompatibleCameraVideo');
      await attach(await prepareCompatibleCameraVideo(original, source, duration, signal,
        percent => options.onProgress({ phase: 'prepare', percent })));
      await releaseOriginal();
    }
    const timestamp = Math.min(source.timestamp, Math.max(0, duration - 0.001));
    if (Math.abs(video.currentTime - timestamp) > 0.001) await mediaEvent(video, 'seeked', signal, () => { video.currentTime = timestamp; });
    signal.throwIfAborted();
    return { duration, dispose: async () => { signal.removeEventListener('abort', cancel); await dispose(); } };
  } catch (error) {
    signal.removeEventListener('abort', cancel); await dispose().catch(() => {}); throw error;
  }
}
