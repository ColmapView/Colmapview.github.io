import { useEffect, useRef, useState } from 'react';
import type { CameraVideoSource } from '../../dataset/video/types';
import type { CameraVideoCache } from '../../dataset/video/cameraVideoCache';
import { loadCachedCameraVideo, type CameraVideoProgress } from '../../dataset/video/cachedCameraVideo';
import { buttonStyles, controlPanelStyles, TOUCH } from '../../theme';
import type { SingleImageLayout } from './imageDetailLayoutViewModel';

const iconButton = `${buttonStyles.base} button-standard ${buttonStyles.sizes.iconMd} ${buttonStyles.variants.ghost}`;
const iconStyle = { minWidth: TOUCH.minTapTarget };
function formatTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

interface CameraVideoPlayerProps {
  source: CameraVideoSource;
  cache?: CameraVideoCache;
  name: string;
  poster: string | null;
  layout: SingleImageLayout;
  onClose(): void;
}

/** One displayed camera, with controls that never affect image placement. */
export default function CameraVideoPlayer({ source, cache, name, poster, layout, onClose }: CameraVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const matchedTime = source.timestamp / (source.playbackRate ?? 1);
  const [time, setTime] = useState(matchedTime);
  const [duration, setDuration] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState<CameraVideoProgress | null>({ phase: 'download', percent: 0 });
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const wantsPlay = useRef(!document.hidden);

  useEffect(() => {
    const video = videoRef.current!;
    const controller = new AbortController();
    controllerRef.current = controller;
    let cached: Awaited<ReturnType<typeof loadCachedCameraVideo>> | undefined;
    const stop = () => { wantsPlay.current = false; video.pause(); setPlaying(false); };
    const disposeSource = () => { controller.abort(); stop(); void cached?.dispose().catch(() => {}); };
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hide); source.signal.addEventListener('abort', disposeSource, { once: true });
    void loadCachedCameraVideo(source, video, { signal: controller.signal, cache,
      onProgress(value) { if (!controller.signal.aborted) setProgress(value); },
    }).then(async resource => {
      cached = resource;
      if (controller.signal.aborted || source.signal.aborted) { await resource.dispose(); return; }
      setDuration(resource.duration); setProgress(null); setTime(video.currentTime);
      if (wantsPlay.current && !document.hidden) await video.play();
    }).catch(failure => {
      if (!controller.signal.aborted && !source.signal.aborted) {
        setError(failure instanceof Error ? failure.message : 'Video could not be played.'); setProgress(null); setPlaying(false);
      }
    });
    return () => {
      controller.abort(); video.pause();
      void cached?.dispose().catch(() => {});
      document.removeEventListener('visibilitychange', hide); source.signal.removeEventListener('abort', disposeSource);
    };
  }, [source, cache, revision]);

  const toggle = () => {
    const video = videoRef.current!;
    if (error) { wantsPlay.current = true; setError(''); setDuration(null); setProgress({ phase: 'download', percent: 0 }); setRevision(value => value + 1); return; }
    if (!video.paused) { wantsPlay.current = false; video.pause(); }
    else {
      wantsPlay.current = true;
      if (video.ended) video.currentTime = 0;
      const signal = controllerRef.current?.signal;
      void video.play().catch(failure => {
        if (!signal?.aborted && !source.signal.aborted) setError(failure instanceof Error ? failure.message : 'Video could not be played.');
      });
    }
  };
  return <div className="absolute" style={{ left: layout.offsetX, top: layout.offsetY, width: layout.renderedImageWidth, height: layout.renderedImageHeight }}
    role="group" aria-label={`Camera video ${name}`} onWheel={event => event.stopPropagation()}
    onTouchStart={event => event.stopPropagation()} onTouchMove={event => event.stopPropagation()} onTouchEnd={event => event.stopPropagation()}>
    {poster && <img src={poster} alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none" />}
    <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain" style={{ opacity: duration === null ? 0 : 1 }} aria-label={`Video frame ${name}`} poster={poster ?? undefined}
      muted playsInline preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onTimeUpdate={event => { if (duration !== null) setTime(event.currentTarget.currentTime); }} onSeeked={event => { if (duration !== null) setTime(event.currentTarget.currentTime); }}
      onError={() => { if (duration !== null && !controllerRef.current?.signal.aborted) { setError('Video could not be played.'); setPlaying(false); } }} />
    <div className="absolute bottom-2 left-2 right-2 rounded bg-ds-void/70 text-ds-secondary flex items-center gap-1 px-1" aria-label="Video controls">
        <button className={iconButton} style={iconStyle} disabled={progress !== null} aria-label={playing ? 'Pause video' : error ? 'Retry video' : 'Play video'} onClick={toggle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{playing ? <path d="M6 4h4v16H6zm8 0h4v16h-4z" /> : <path d="m7 3 15 9-15 9z" />}</svg>
        </button>
        {progress || error ? <span className="flex-1 min-w-0 text-xs truncate" role={error ? 'alert' : 'status'} title={error || undefined}>
          {error || `${progress!.phase === 'download' ? 'Loading video' : 'Preparing video'} ${progress!.percent}%`}
        </span> : <input type="range" className={`${controlPanelStyles.slider} button-standard`} aria-label="Video time" min={0} max={duration ?? matchedTime + 1} step="0.01"
          title={`${formatTime(time)} / ${duration === null ? '—' : formatTime(duration)}`} aria-valuetext={`${formatTime(time)} / ${duration === null ? '—' : formatTime(duration)}`}
          value={time} disabled={duration === null} onChange={event => { const value = Number(event.target.value); videoRef.current!.currentTime = value; setTime(value); }} />}
        <button className={iconButton} style={iconStyle} aria-label="Back to matched frame" title={`Back to matched frame (${formatTime(matchedTime)})`} onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 10h11a6 6 0 0 1 0 12M3 10l6-6M3 10l6 6" /></svg>
        </button>
    </div>
  </div>;
}
