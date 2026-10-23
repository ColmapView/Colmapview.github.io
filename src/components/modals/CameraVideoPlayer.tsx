import { useEffect, useRef, useState } from 'react';
import type { CameraVideoSource } from '../../dataset/video/types';
import { playCameraVideo } from '../../dataset/video/videoPlayback';
import { buttonStyles, TOUCH } from '../../theme';

const iconButton = `${buttonStyles.base} button-standard ${buttonStyles.sizes.iconLg} ${buttonStyles.variants.ghost}`;
const iconStyle = { minWidth: TOUCH.minTapTarget };
function VideoPlaybackIcon({ playing }: { playing: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {playing ? <path d="M6 4h4v16H6zm8 0h4v16h-4z" /> : <path d="m7 3 15 9-15 9z" />}
  </svg>;
}

function formatTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

interface CameraVideoPlayerProps {
  source: CameraVideoSource;
  name: string;
  onClose(): void;
}

/** Mounted only after an explicit Play action, keyed by camera and dataset by its parent. */
export default function CameraVideoPlayer({ source, name, onClose }: CameraVideoPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const positionRef = useRef(source.timestamp);
  const durationRef = useRef<number | null>(null);
  const [time, setTime] = useState(source.timestamp);
  const [duration, setDuration] = useState<number | null>(null);
  const [playing, setPlaying] = useState(!document.hidden);
  const [preview, setPreview] = useState(false);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<'loading' | 'playing' | 'paused' | 'ended' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const stop = () => {
      clearTimeout(seekTimerRef.current);
      controllerRef.current?.abort(); setPlaying(false); setPreview(false); setStatus('paused');
    };
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', hide);
    source.signal.addEventListener('abort', stop, { once: true });
    return () => { document.removeEventListener('visibilitychange', hide); source.signal.removeEventListener('abort', stop); clearTimeout(seekTimerRef.current); };
  }, [source]);

  useEffect(() => {
    if ((!playing && !preview) || !canvasRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    let lastUpdate = -Infinity;
    let bufferingTimer: ReturnType<typeof setTimeout>;
    const buffer = (waiting: boolean) => {
      clearTimeout(bufferingTimer);
      if (waiting) bufferingTimer = setTimeout(() => { if (!controller.signal.aborted) setStatus('loading'); }, 250);
    };
    buffer(true);
    void playCameraVideo(source, canvasRef.current, {
      timestamp: positionRef.current,
      singleFrame: !playing,
      signal: controller.signal,
      onReady(value) { if (!controller.signal.aborted) { durationRef.current = value; setDuration(value); } },
      onBuffering: buffer,
      onFrame(value) {
        if (controller.signal.aborted) return;
        clearTimeout(bufferingTimer);
        positionRef.current = value;
        setStatus(playing ? 'playing' : 'paused');
        if (performance.now() - lastUpdate > 200) { setTime(value); lastUpdate = performance.now(); }
      },
    }).then(() => {
      if (!controller.signal.aborted) {
        setStatus(playing ? 'ended' : 'paused'); setPlaying(false); setPreview(false);
        setTime(playing ? durationRef.current ?? positionRef.current : positionRef.current);
      }
    }, failure => {
      if (!controller.signal.aborted && !source.signal.aborted) {
        setError(failure instanceof Error ? failure.message : 'Video could not be played.');
        setStatus('error'); setPlaying(false); setPreview(false);
      }
    }).finally(() => clearTimeout(bufferingTimer));
    return () => { controller.abort(); clearTimeout(bufferingTimer); };
  }, [source, playing, preview, revision]);

  useEffect(() => {
    const canvas = canvasRef.current;
    return () => { if (canvas) { canvas.width = 0; canvas.height = 0; } };
  }, []);

  const pause = () => { clearTimeout(seekTimerRef.current); controllerRef.current?.abort(); setPlaying(false); setPreview(false); setStatus('paused'); setTime(positionRef.current); };
  const resume = () => {
    clearTimeout(seekTimerRef.current); controllerRef.current?.abort(); setPreview(false);
    if (status === 'ended') { positionRef.current = 0; setTime(0); }
    setError(''); setPlaying(true); setStatus('loading');
  };
  const seek = (value: number) => {
    controllerRef.current?.abort();
    clearTimeout(seekTimerRef.current);
    positionRef.current = value;
    setTime(value); setError(''); setStatus('loading');
    seekTimerRef.current = setTimeout(() => { setPreview(!playing); setRevision(value => value + 1); }, 150);
  };

  return <div className="absolute inset-0 flex flex-col bg-ds-secondary" role="group" aria-label={`Camera video ${name}`}
    onWheel={event => event.stopPropagation()} onTouchStart={event => event.stopPropagation()}
    onTouchMove={event => event.stopPropagation()} onTouchEnd={event => event.stopPropagation()}>
    <div className="relative flex-1 min-h-0">
      <canvas ref={canvasRef} className="w-full h-full object-contain" aria-label={`Video frame ${name}`} />
      {status === 'loading' && <span className="absolute top-2 left-2 rounded bg-ds-void/70 px-2 py-1 text-xs text-ds-secondary" role="status">Buffering…</span>}
      {error && <div className="absolute inset-0 flex items-center justify-center p-4 bg-ds-void/70 text-sm text-ds-primary" role="alert">{error}</div>}
    </div>
    <div className="flex items-center gap-2 px-2 py-1 bg-ds-tertiary text-ds-primary flex-shrink-0">
      <button className={iconButton} style={iconStyle} aria-label={playing ? 'Pause video' : status === 'error' ? 'Retry video' : 'Play video'} onClick={playing ? pause : resume}>
        <VideoPlaybackIcon playing={playing} />
      </button>
      <input type="range" className="button-standard min-w-0 flex-1 accent-ds-accent" aria-label="Video time" min={0} max={duration ?? source.timestamp + 1} step="0.01"
        value={time} disabled={duration === null} onChange={event => seek(Number(event.target.value))} />
      <span className="text-xs font-mono tabular-nums whitespace-nowrap">{formatTime(time)} / {duration === null ? '—' : formatTime(duration)}</span>
      <button className={iconButton} style={iconStyle} aria-label="Back to matched frame" title={`Back to matched frame (${formatTime(source.timestamp)})`} onClick={onClose}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 10h11a6 6 0 0 1 0 12M3 10l6-6M3 10l6 6" /></svg>
      </button>
    </div>
    <div className="px-3 pb-1 bg-ds-tertiary text-xs text-ds-muted">Reconstruction at {formatTime(source.timestamp)}</div>
  </div>;
}
