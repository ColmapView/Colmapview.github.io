import type { RefObject } from 'react';
import type GifEncoder from 'gif.js';
import {
  getDownsampledDimensions,
  getGifQuality,
  getGifWorkerCount,
  type RecordingQuality,
} from './screenshotRecordingPolicy';

export interface GifRecorderOptions {
  workers: number;
  quality: number;
  width: number;
  height: number;
  workerScript: string;
}

interface ScreenshotGifRecordingStartOptions {
  sourceWidth: number;
  sourceHeight: number;
  downsample: number;
  durationMs: number;
  speedFactor: number;
  recordingQuality: RecordingQuality;
  hardwareConcurrency: number | undefined;
  workerScript: string;
  gifRef: RefObject<GifEncoder | null>;
  gifStartTimeRef: RefObject<number>;
  gifLastFrameTimeRef: RefObject<number>;
  gifResolveRef: RefObject<((blob: Blob | null) => void) | null>;
  gifDurationMsRef: RefObject<number>;
  gifDownsampleFactorRef: RefObject<number>;
  gifSpeedFactorRef: RefObject<number>;
  gifFrameCountRef: RefObject<number>;
  lastProgressNotificationTimeRef: RefObject<number>;
  setGifBlobUrl: (url: string | null) => void;
  setGifRenderProgress: (progress: number | null) => void;
  setIsRecordingGif: (isRecording: boolean) => void;
  createGifRecorder: (options: GifRecorderOptions) => GifEncoder;
  createObjectUrl?: (blob: Blob) => string;
  now?: () => number;
}

export function startScreenshotGifRecording({
  sourceWidth,
  sourceHeight,
  downsample,
  durationMs,
  speedFactor,
  recordingQuality,
  hardwareConcurrency,
  workerScript,
  gifRef,
  gifStartTimeRef,
  gifLastFrameTimeRef,
  gifResolveRef,
  gifDurationMsRef,
  gifDownsampleFactorRef,
  gifSpeedFactorRef,
  gifFrameCountRef,
  lastProgressNotificationTimeRef,
  setGifBlobUrl,
  setGifRenderProgress,
  setIsRecordingGif,
  createGifRecorder,
  createObjectUrl = URL.createObjectURL.bind(URL),
  now = () => performance.now(),
}: ScreenshotGifRecordingStartOptions): Promise<Blob | null> {
  return new Promise((resolve) => {
    const { width, height } = getDownsampledDimensions(sourceWidth, sourceHeight, downsample);
    const gif = createGifRecorder({
      workers: getGifWorkerCount(hardwareConcurrency),
      quality: getGifQuality(recordingQuality),
      width,
      height,
      workerScript,
    });

    gif.on('finished', (blob: Blob) => {
      const url = createObjectUrl(blob);
      setGifBlobUrl(url);
      setGifRenderProgress(null);
      setIsRecordingGif(false);
      resolve(blob);
    });

    gif.on('progress', (progress: number) => {
      setGifRenderProgress(Math.round(progress * 100));
    });

    gif.on('abort', () => {
      setGifRenderProgress(null);
      setIsRecordingGif(false);
      resolve(null);
    });

    gifRef.current = gif;
    gifStartTimeRef.current = now();
    gifLastFrameTimeRef.current = 0;
    gifResolveRef.current = resolve;
    gifDurationMsRef.current = durationMs;
    gifDownsampleFactorRef.current = downsample;
    gifSpeedFactorRef.current = speedFactor;
    gifFrameCountRef.current = 0;
    lastProgressNotificationTimeRef.current = 0;
    setGifRenderProgress(null);
    setIsRecordingGif(true);
  });
}
