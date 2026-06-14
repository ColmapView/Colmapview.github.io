import type { RefObject } from 'react';
import { appLogger } from '../../utils/logger';
import {
  RECORDING_FPS,
  formatBitrateMbps,
  getAvcCodecForDimensions,
  getEvenDownsampledDimensions,
  getVideoBitrate,
  type RecordingQuality,
} from './screenshotRecordingPolicy';
import { createRecordingCanvas } from './screenshotRecordingCanvas';

export interface WebCodecsMuxer {
  target: {
    buffer: ArrayBuffer | null;
  };
  start(): Promise<void>;
  addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): Promise<void>;
  finalize(): Promise<void>;
}

interface CreateWebCodecsMuxerOptions {
  width: number;
  height: number;
}

interface ScreenshotWebCodecsStartOptions {
  sourceWidth: number;
  sourceHeight: number;
  downsample: number;
  durationMs: number;
  speedFactor: number;
  recordingQuality: RecordingQuality;
  videoEncoderRef: RefObject<VideoEncoder | null>;
  muxerRef: RefObject<WebCodecsMuxer | null>;
  webCodecsCanvasRef: RefObject<HTMLCanvasElement | null>;
  webCodecsStartTimeRef: RefObject<number>;
  webCodecsDurationMsRef: RefObject<number>;
  webCodecsSpeedFactorRef: RefObject<number>;
  webCodecsFrameCountRef: RefObject<number>;
  webCodecsLastFrameTimeRef: RefObject<number>;
  isRecordingWebCodecsRef: RefObject<boolean>;
  webCodecsResolveRef: RefObject<((blob: Blob | null) => void) | null>;
  lastProgressNotificationTimeRef: RefObject<number>;
  setIsRecordingGif: (isRecording: boolean) => void;
  createMuxer: (options: CreateWebCodecsMuxerOptions) => WebCodecsMuxer;
  createEncoder?: (init: VideoEncoderInit) => VideoEncoder;
  createCanvas?: typeof createRecordingCanvas;
  now?: () => number;
  log?: (message: string) => void;
  errorLog?: (message: string, error: unknown) => void;
}

export async function startScreenshotWebCodecsRecording({
  sourceWidth,
  sourceHeight,
  downsample,
  durationMs,
  speedFactor,
  recordingQuality,
  videoEncoderRef,
  muxerRef,
  webCodecsCanvasRef,
  webCodecsStartTimeRef,
  webCodecsDurationMsRef,
  webCodecsSpeedFactorRef,
  webCodecsFrameCountRef,
  webCodecsLastFrameTimeRef,
  isRecordingWebCodecsRef,
  webCodecsResolveRef,
  lastProgressNotificationTimeRef,
  setIsRecordingGif,
  createMuxer,
  createEncoder = (init) => new VideoEncoder(init),
  createCanvas = createRecordingCanvas,
  now = () => performance.now(),
  log = appLogger.info,
  errorLog = appLogger.error,
}: ScreenshotWebCodecsStartOptions): Promise<Blob | null> {
  let resolveRecording: (blob: Blob | null) => void = () => {};
  let rejectRecording: (error: unknown) => void = () => {};
  const completion = new Promise<Blob | null>((resolve, reject) => {
    resolveRecording = resolve;
    rejectRecording = reject;
  });

  const { width, height } = getEvenDownsampledDimensions(sourceWidth, sourceHeight, downsample);
  const bitrate = getVideoBitrate(width, height, recordingQuality);
  log(`WebCodecs recording: ${width}x${height}, bitrate=${formatBitrateMbps(bitrate)}Mbps`);

  const muxer = createMuxer({ width, height });
  const handleRecordingError = (message: string, error: unknown) => {
    errorLog(message, error);
    setIsRecordingGif(false);
    isRecordingWebCodecsRef.current = false;
    rejectRecording(error);
  };
  const encoder = createEncoder({
    output: (chunk, meta) => {
      void muxer.addVideoChunk(chunk, meta ?? undefined).catch((error: unknown) => {
        handleRecordingError('Video muxer write failed:', error);
      });
    },
    error: (error) => {
      handleRecordingError('VideoEncoder error:', error);
    },
  });

  const codec = getAvcCodecForDimensions(width, height);

  try {
    encoder.configure({
      codec,
      width,
      height,
      bitrate,
      framerate: RECORDING_FPS,
    });
    log(`VideoEncoder configured: ${codec}, ${width}x${height}, ${formatBitrateMbps(bitrate)}Mbps`);
  } catch (error) {
    errorLog('VideoEncoder configure failed:', error);
    throw error;
  }

  try {
    await muxer.start();
  } catch (error) {
    errorLog('MP4 muxer start failed:', error);
    encoder.close();
    throw error;
  }

  const canvas = createCanvas(width, height);

  videoEncoderRef.current = encoder;
  muxerRef.current = muxer;
  webCodecsCanvasRef.current = canvas;
  webCodecsStartTimeRef.current = now();
  webCodecsDurationMsRef.current = durationMs;
  webCodecsSpeedFactorRef.current = speedFactor;
  webCodecsFrameCountRef.current = 0;
  webCodecsLastFrameTimeRef.current = 0;
  isRecordingWebCodecsRef.current = true;
  webCodecsResolveRef.current = resolveRecording;
  lastProgressNotificationTimeRef.current = 0;

  setIsRecordingGif(true);
  return completion;
}
