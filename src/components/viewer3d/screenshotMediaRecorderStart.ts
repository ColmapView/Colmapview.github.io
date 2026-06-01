import type { RefObject } from 'react';
import { appLogger } from '../../utils/logger';
import {
  RECORDING_FPS,
  formatBitrateMbps,
  getDownsampledDimensions,
  getMediaRecorderMimeConfig,
  getVideoBitrate,
  type RecordingFormat,
  type RecordingQuality,
} from './screenshotRecordingPolicy';
import { createRecordingCanvas } from './screenshotRecordingCanvas';

type RecordingCanvas = HTMLCanvasElement & {
  captureStream(frameRate?: number): MediaStream;
};

interface ScreenshotMediaRecorderStartOptions {
  format: RecordingFormat;
  sourceWidth: number;
  sourceHeight: number;
  downsample: number;
  durationMs: number;
  speedFactor: number;
  recordingQuality: RecordingQuality;
  webmRecorderRef: RefObject<MediaRecorder | null>;
  webmCanvasRef: RefObject<HTMLCanvasElement | null>;
  webmStartTimeRef: RefObject<number>;
  webmDurationMsRef: RefObject<number>;
  webmChunksRef: RefObject<Blob[]>;
  webmResolveRef: RefObject<((blob: Blob | null) => void) | null>;
  isRecordingWebmRef: RefObject<boolean>;
  webmSpeedFactorRef: RefObject<number>;
  webmFrameCounterRef: RefObject<number>;
  webmLastFrameTimeRef: RefObject<number>;
  lastProgressNotificationTimeRef: RefObject<number>;
  setGifBlobUrl: (url: string | null) => void;
  setIsRecordingGif: (isRecording: boolean) => void;
  createCanvas?: (width: number, height: number) => RecordingCanvas;
  createRecorder?: (stream: MediaStream, options: MediaRecorderOptions) => MediaRecorder;
  isTypeSupported?: (mimeType: string) => boolean;
  createObjectUrl?: (blob: Blob) => string;
  now?: () => number;
  log?: (message: string) => void;
  warn?: (message: string) => void;
}

export function startScreenshotMediaRecorderRecording({
  format,
  sourceWidth,
  sourceHeight,
  downsample,
  durationMs,
  speedFactor,
  recordingQuality,
  webmRecorderRef,
  webmCanvasRef,
  webmStartTimeRef,
  webmDurationMsRef,
  webmChunksRef,
  webmResolveRef,
  isRecordingWebmRef,
  webmSpeedFactorRef,
  webmFrameCounterRef,
  webmLastFrameTimeRef,
  lastProgressNotificationTimeRef,
  setGifBlobUrl,
  setIsRecordingGif,
  createCanvas = createRecordingCanvas as (width: number, height: number) => RecordingCanvas,
  createRecorder = (stream, options) => new MediaRecorder(stream, options),
  isTypeSupported = MediaRecorder.isTypeSupported.bind(MediaRecorder),
  createObjectUrl = URL.createObjectURL.bind(URL),
  now = () => performance.now(),
  log = appLogger.info,
  warn = appLogger.warn,
}: ScreenshotMediaRecorderStartOptions): Promise<Blob | null> {
  return new Promise((resolve) => {
    const { width, height } = getDownsampledDimensions(sourceWidth, sourceHeight, downsample);
    const canvas = createCanvas(width, height);
    webmCanvasRef.current = canvas;

    const stream = canvas.captureStream(RECORDING_FPS);
    const { mimeType, blobType } = getMediaRecorderMimeConfig(format, isTypeSupported);
    if (format === 'mp4' && blobType === 'video/webm') {
      warn('MP4 not supported, falling back to WebM');
    }

    const bitrate = getVideoBitrate(width, height, recordingQuality);
    log(`MediaRecorder: ${width}x${height}, bitrate=${formatBitrateMbps(bitrate)}Mbps, format=${mimeType}`);

    const recorder = createRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitrate,
    });

    webmChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        webmChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(webmChunksRef.current, { type: blobType });
      const url = createObjectUrl(blob);
      setGifBlobUrl(url);
      setIsRecordingGif(false);
      isRecordingWebmRef.current = false;
      webmRecorderRef.current = null;
      webmCanvasRef.current = null;
      resolve(blob);
    };

    webmRecorderRef.current = recorder;
    webmStartTimeRef.current = now();
    webmLastFrameTimeRef.current = 0;
    webmDurationMsRef.current = durationMs;
    webmResolveRef.current = resolve;
    webmSpeedFactorRef.current = speedFactor;
    webmFrameCounterRef.current = 0;
    isRecordingWebmRef.current = true;
    lastProgressNotificationTimeRef.current = 0;

    recorder.start();
    setIsRecordingGif(true);
  });
}
