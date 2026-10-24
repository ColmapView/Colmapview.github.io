import { BlobSource, Input, MP4, WEBM } from 'mediabunny';
import { anySignal } from '../../utils/abortSignals';
import { readVideoTrack } from './videoInput';
import { MAX_CACHED_VIDEO_BYTES, type CameraVideoProgress, type CameraVideoSource } from './types';
import { createCameraVideoCache, type CameraVideoCache, type PreparedCameraVideo } from './cameraVideoCache';

/** Validate and optionally retime a local source, always releasing its demuxer. */
async function prepareCameraVideoFile(original: Blob, source: CameraVideoSource, signal: AbortSignal,
  onProgress: (progress: CameraVideoProgress) => void): Promise<PreparedCameraVideo> {
  const input = new Input({ source: new BlobSource(original), formats: [MP4, WEBM] });
  const abortInput = () => input.dispose();
  signal.addEventListener('abort', abortInput, { once: true });
  try {
    const { track, duration } = await readVideoTrack(input, source, signal);
    const codec = (await track.getDecoderConfig())?.codec, container = (await input.getFormat()).mimeType;
    const rate = source.playbackRate ?? 1;
    let blob = original;
    if (rate !== 1) {
      onProgress({ phase: 'prepare', percent: 0 });
      const { retimeCameraVideo } = await import('./retimeCameraVideo');
      blob = await retimeCameraVideo(track, container, rate, signal);
    }
    return { blob, duration: duration / rate, mimeType: `${container}${codec ? `; codecs="${codec}"` : ''}` };
  } finally { signal.removeEventListener('abort', abortInput); input.dispose(); }
}

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

/** Attach a cached recording; the navigation window owns shared files, this player owns its Blob URL. */
export async function loadCachedCameraVideo(source: CameraVideoSource, video: HTMLVideoElement, options: {
  signal: AbortSignal;
  onProgress(progress: CameraVideoProgress): void;
  cache?: CameraVideoCache;
}) {
  const signal = anySignal([source.signal, options.signal]);
  // React's same-turn development cleanup must not start a throwaway download.
  await Promise.resolve();
  signal.throwIfAborted();
  if (source.bytes > MAX_CACHED_VIDEO_BYTES) throw new Error('This video exceeds the 256 MiB playback cache limit.');
  const cache = options.cache ?? createCameraVideoCache();
  let lease: Awaited<ReturnType<CameraVideoCache['acquire']>> | undefined, url: string | undefined;
  const detach = () => {
    if (!url) return;
    if (video.getAttribute('src') === url) { video.pause(); video.removeAttribute('src'); video.load(); }
    URL.revokeObjectURL(url); url = undefined;
  };
  const dispose = async () => {
    detach(); await lease?.dispose();
    if (!options.cache) await cache.clear();
  };
  const cancel = () => { void dispose().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const attach = async (blob: Blob) => {
    signal.throwIfAborted(); detach(); url = URL.createObjectURL(blob);
    await mediaEvent(video, 'loadeddata', signal, () => { video.src = url!; video.load(); });
  };
  try {
    lease = await cache.acquire(source, signal, options.onProgress);
    signal.throwIfAborted();
    let prepared = lease.getPrepared();
    const matchedTime = source.timestamp / (source.playbackRate ?? 1);
    if (!prepared) {
      prepared = await prepareCameraVideoFile(lease.blob, source, signal, options.onProgress);
      lease.setPrepared(prepared);
    }
    const { duration } = prepared;
    if (matchedTime >= duration) throw new Error('The matched frame is outside the video.');
    let convert = !prepared.playable && !video.canPlayType(prepared.mimeType);
    if (!convert) {
      try { await attach(prepared.blob); }
      catch { signal.throwIfAborted(); convert = true; }
    }
    if (convert) {
      detach(); options.onProgress({ phase: 'prepare', percent: 0 });
      const { prepareCompatibleCameraVideo } = await import('./prepareCompatibleCameraVideo');
      const blob = await prepareCompatibleCameraVideo(prepared.blob, source, duration, signal,
        percent => options.onProgress({ phase: 'prepare', percent }));
      await attach(blob);
      prepared = { blob, duration, mimeType: 'video/mp4' };
    }
    const timestamp = Math.min(matchedTime, Math.max(0, duration - 0.001));
    if (Math.abs(video.currentTime - timestamp) > 0.001) await mediaEvent(video, 'seeked', signal, () => { video.currentTime = timestamp; });
    signal.throwIfAborted();
    lease.setPrepared({ ...prepared, playable: true });
    return { duration, dispose: async () => { signal.removeEventListener('abort', cancel); await dispose(); } };
  } catch (error) {
    signal.removeEventListener('abort', cancel); await dispose().catch(() => {}); throw error;
  }
}
