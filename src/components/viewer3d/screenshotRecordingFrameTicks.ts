import type GifEncoder from 'gif.js';
import type { RefObject } from 'react';
import type * as THREE from 'three';
import { useNotificationStore, type NotificationState } from '../../store/stores/notificationStore';
import { appLogger } from '../../utils/logger';
import {
  getGifFrameDelay,
  getMediaRecorderTotalDurationMs,
  getRecordingProgressDecision,
  getRenderingFramesMessage,
  getWebCodecsFrameTimestamp,
  isRecordingFrameDue,
} from './screenshotRecordingPolicy';
import {
  captureDownsampledRecordingFrame,
  drawRecordingFrameToCanvas,
  type ScreenshotLogoDrawer,
} from './screenshotRecordingCanvas';

type RecordingRenderer = Pick<THREE.WebGLRenderer, 'domElement' | 'render'>;
type AddNotification = NotificationState['addNotification'];
type LogWithError = (message: string, error: unknown) => void;
type CaptureDownsampledFrame = typeof captureDownsampledRecordingFrame;
type DrawFrameToCanvas = typeof drawRecordingFrameToCanvas;
type CreateVideoFrame = (canvas: HTMLCanvasElement, timestamp: number) => VideoFrame;

interface RecordingFrameLoopBaseOptions {
  gl: RecordingRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  addLogoToCanvas: ScreenshotLogoDrawer;
  screenshotHideLogo: boolean;
  lastProgressNotificationTimeRef: RefObject<number>;
  showProgressNotification: (elapsed: number, total: number) => void;
  now?: () => number;
  warn?: LogWithError;
}

export interface GifRecordingFrameTickOptions extends RecordingFrameLoopBaseOptions {
  gifRef: RefObject<GifEncoder | null>;
  gifStartTimeRef: RefObject<number>;
  gifLastFrameTimeRef: RefObject<number>;
  gifDurationMsRef: RefObject<number>;
  gifDownsampleFactorRef: RefObject<number>;
  gifSpeedFactorRef: RefObject<number>;
  gifFrameCountRef: RefObject<number>;
  setGifRenderProgress: (progress: number | null) => void;
  setIsRecordingGif: (isRecording: boolean) => void;
  addNotification?: AddNotification;
  errorLog?: LogWithError;
  captureDownsampledFrame?: CaptureDownsampledFrame;
}

export interface WebCodecsRecordingFrameTickOptions extends RecordingFrameLoopBaseOptions {
  videoEncoderRef: RefObject<VideoEncoder | null>;
  webCodecsCanvasRef: RefObject<HTMLCanvasElement | null>;
  webCodecsStartTimeRef: RefObject<number>;
  webCodecsDurationMsRef: RefObject<number>;
  webCodecsSpeedFactorRef: RefObject<number>;
  webCodecsFrameCountRef: RefObject<number>;
  webCodecsLastFrameTimeRef: RefObject<number>;
  isRecordingWebCodecsRef: RefObject<boolean>;
  finishWebCodecsRecording: () => void | Promise<void>;
  createVideoFrame?: CreateVideoFrame;
  drawFrameToCanvas?: DrawFrameToCanvas;
  log?: (message: string) => void;
}

export interface MediaRecorderRecordingFrameTickOptions extends RecordingFrameLoopBaseOptions {
  webmRecorderRef: RefObject<MediaRecorder | null>;
  webmCanvasRef: RefObject<HTMLCanvasElement | null>;
  webmStartTimeRef: RefObject<number>;
  webmDurationMsRef: RefObject<number>;
  isRecordingWebmRef: RefObject<boolean>;
  webmSpeedFactorRef: RefObject<number>;
  webmLastFrameTimeRef: RefObject<number>;
  drawFrameToCanvas?: DrawFrameToCanvas;
}

export interface ScreenshotRecordingFrameLoopOptions
  extends Omit<GifRecordingFrameTickOptions, 'now' | 'warn' | 'addNotification' | 'errorLog' | 'captureDownsampledFrame'>,
    Omit<WebCodecsRecordingFrameTickOptions, 'now' | 'warn' | 'drawFrameToCanvas' | 'createVideoFrame' | 'log'>,
    Omit<MediaRecorderRecordingFrameTickOptions, 'now' | 'warn' | 'drawFrameToCanvas'> {
  warn?: LogWithError;
  errorLog?: LogWithError;
  log?: (message: string) => void;
}

export function tickGifRecordingFrame({
  gl,
  scene,
  camera,
  addLogoToCanvas,
  screenshotHideLogo,
  gifRef,
  gifStartTimeRef,
  gifLastFrameTimeRef,
  gifDurationMsRef,
  gifDownsampleFactorRef,
  gifSpeedFactorRef,
  gifFrameCountRef,
  lastProgressNotificationTimeRef,
  showProgressNotification,
  setGifRenderProgress,
  setIsRecordingGif,
  addNotification = useNotificationStore.getState().addNotification,
  now = () => performance.now(),
  warn = appLogger.warn,
  errorLog = appLogger.error,
  captureDownsampledFrame = captureDownsampledRecordingFrame,
}: GifRecordingFrameTickOptions): void {
  if (!gifRef.current) return;

  const elapsed = now() - gifStartTimeRef.current;
  const duration = gifDurationMsRef.current;

  const progress = getRecordingProgressDecision(elapsed, duration, lastProgressNotificationTimeRef.current);
  if (progress.hasElapsedSecondChanged) {
    if (progress.shouldNotify) {
      showProgressNotification(elapsed, duration);
    }
    lastProgressNotificationTimeRef.current = progress.elapsedSeconds;
  }

  if (elapsed >= duration) {
    lastProgressNotificationTimeRef.current = 0;
    const gif = gifRef.current;
    gifRef.current = null;

    try {
      setGifRenderProgress(0);
      addNotification('info', getRenderingFramesMessage(gifFrameCountRef.current), 3000);
      gif.render();
    } catch (error) {
      errorLog('gif.render() error:', error);
      setGifRenderProgress(null);
      setIsRecordingGif(false);
    }
    return;
  }

  if (!isRecordingFrameDue(elapsed, gifLastFrameTimeRef.current)) return;

  gifLastFrameTimeRef.current = elapsed;

  try {
    const canvas = captureDownsampledFrame({
      gl,
      scene,
      camera,
      downsample: gifDownsampleFactorRef.current,
      addLogoToCanvas,
      screenshotHideLogo,
    });
    gifRef.current?.addFrame(canvas, {
      delay: getGifFrameDelay(gifSpeedFactorRef.current),
      copy: true,
    });
    gifFrameCountRef.current++;
  } catch (error) {
    warn('GIF frame capture failed:', error);
  }
}

export function tickWebCodecsRecordingFrame({
  gl,
  scene,
  camera,
  addLogoToCanvas,
  screenshotHideLogo,
  videoEncoderRef,
  webCodecsCanvasRef,
  webCodecsStartTimeRef,
  webCodecsDurationMsRef,
  webCodecsSpeedFactorRef,
  webCodecsFrameCountRef,
  webCodecsLastFrameTimeRef,
  isRecordingWebCodecsRef,
  lastProgressNotificationTimeRef,
  showProgressNotification,
  finishWebCodecsRecording,
  now = () => performance.now(),
  warn = appLogger.warn,
  log = appLogger.info,
  createVideoFrame = (canvas, timestamp) => new VideoFrame(canvas, { timestamp }),
  drawFrameToCanvas = drawRecordingFrameToCanvas,
}: WebCodecsRecordingFrameTickOptions): void {
  if (!isRecordingWebCodecsRef.current || !videoEncoderRef.current || !webCodecsCanvasRef.current) return;

  const elapsed = now() - webCodecsStartTimeRef.current;

  const progress = getRecordingProgressDecision(
    elapsed,
    webCodecsDurationMsRef.current,
    lastProgressNotificationTimeRef.current
  );
  if (progress.hasElapsedSecondChanged) {
    log(`MP4: ${progress.elapsedSeconds}s, ${webCodecsFrameCountRef.current} frames`);
    if (progress.shouldNotify) {
      showProgressNotification(elapsed, webCodecsDurationMsRef.current);
    }
    lastProgressNotificationTimeRef.current = progress.elapsedSeconds;
  }

  if (elapsed >= webCodecsDurationMsRef.current) {
    lastProgressNotificationTimeRef.current = 0;
    void finishWebCodecsRecording();
    return;
  }

  if (!isRecordingFrameDue(elapsed, webCodecsLastFrameTimeRef.current)) return;

  webCodecsLastFrameTimeRef.current = elapsed;

  try {
    const canvas = webCodecsCanvasRef.current;
    drawFrameToCanvas({
      gl,
      scene,
      camera,
      canvas,
      addLogoToCanvas,
      screenshotHideLogo,
    });

    const timestamp = getWebCodecsFrameTimestamp(
      webCodecsFrameCountRef.current,
      webCodecsSpeedFactorRef.current
    );
    const frame = createVideoFrame(canvas, timestamp);

    videoEncoderRef.current?.encode(frame, { keyFrame: webCodecsFrameCountRef.current % 30 === 0 });
    frame.close();
    webCodecsFrameCountRef.current++;
  } catch (error) {
    warn('WebCodecs frame capture failed:', error);
  }
}

export function tickMediaRecorderRecordingFrame({
  gl,
  scene,
  camera,
  addLogoToCanvas,
  screenshotHideLogo,
  webmRecorderRef,
  webmCanvasRef,
  webmStartTimeRef,
  webmDurationMsRef,
  isRecordingWebmRef,
  webmSpeedFactorRef,
  webmLastFrameTimeRef,
  lastProgressNotificationTimeRef,
  showProgressNotification,
  now = () => performance.now(),
  warn = appLogger.warn,
  drawFrameToCanvas = drawRecordingFrameToCanvas,
}: MediaRecorderRecordingFrameTickOptions): void {
  if (!isRecordingWebmRef.current || !webmCanvasRef.current || !webmRecorderRef.current) return;

  const elapsed = now() - webmStartTimeRef.current;
  const totalDuration = getMediaRecorderTotalDurationMs(
    webmDurationMsRef.current,
    webmSpeedFactorRef.current
  );

  const progress = getRecordingProgressDecision(elapsed, totalDuration, lastProgressNotificationTimeRef.current);
  if (progress.shouldNotify) {
    lastProgressNotificationTimeRef.current = progress.elapsedSeconds;
    showProgressNotification(elapsed, totalDuration);
  }

  if (elapsed >= totalDuration) {
    lastProgressNotificationTimeRef.current = 0;
    webmRecorderRef.current.stop();
    return;
  }

  if (!isRecordingFrameDue(elapsed, webmLastFrameTimeRef.current)) return;

  webmLastFrameTimeRef.current = elapsed;

  try {
    drawFrameToCanvas({
      gl,
      scene,
      camera,
      canvas: webmCanvasRef.current,
      addLogoToCanvas,
      screenshotHideLogo,
    });
  } catch (error) {
    warn('MediaRecorder frame capture failed:', error);
  }
}
