import { useRef, useEffect, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import type GifEncoder from 'gif.js';
import { appLogger } from '../../utils/logger';
import { publicAsset } from '../../utils/paths';
import {
  getRecordingBackend,
  getRecordingProgressMessage,
  getVideoTrackOptions,
  isWebCodecsRuntimeSupported,
} from './screenshotRecordingPolicy';
import { useScreenshotBlobCapture } from './useScreenshotBlobCapture';
import { useScreenshotDownloadTrigger } from './useScreenshotDownloadTrigger';
import { useScreenshotLogo } from './useScreenshotLogo';
import { useScreenshotRecordingStop } from './useScreenshotRecordingStop';
import { useScreenshotRecordingFrameLoop } from './useScreenshotRecordingFrameLoop';
import { startScreenshotGifRecording } from './screenshotGifRecordingStart';
import { startScreenshotMediaRecorderRecording } from './screenshotMediaRecorderStart';
import {
  startScreenshotWebCodecsRecording,
  type WebCodecsMuxer,
} from './screenshotWebCodecsStart';
import { finishScreenshotWebCodecsRecording } from './screenshotWebCodecsFinish';
import { useScreenshotCaptureStoreFacade } from './useScreenshotCaptureStoreFacade';

export function ScreenshotCapture() {
  const { gl, scene, camera, size } = useThree();
  const {
    data: {
      screenshotTrigger,
      screenshotSize,
      screenshotFormat,
      screenshotHideLogo,
      gifDuration,
      gifDownsample,
      gifSpeed,
      recordingQuality,
      recordingFormat,
    },
    actions: {
      setGetScreenshotBlob,
      setRecordGif,
      setStopRecording,
      setIsRecordingGif,
      setGifRenderProgress,
      setGifBlobUrl,
      addNotification,
    },
  } = useScreenshotCaptureStoreFacade();
  const addLogoToCanvas = useScreenshotLogo();

  useScreenshotBlobCapture({
    gl,
    scene,
    camera,
    screenshotHideLogo,
    setGetScreenshotBlob,
    addLogoToCanvas,
  });

  useScreenshotDownloadTrigger({
    gl,
    scene,
    camera,
    size,
    screenshotTrigger,
    screenshotSize,
    screenshotFormat,
    screenshotHideLogo,
    addLogoToCanvas,
  });

  // GIF recording state
  const gifRef = useRef<GifEncoder | null>(null);
  const gifStartTime = useRef<number>(0);
  const gifLastFrameTime = useRef<number>(0);
  const gifResolve = useRef<((blob: Blob | null) => void) | null>(null);
  const gifDurationMs = useRef<number>(2000);
  const gifDownsampleFactor = useRef<number>(2);
  const gifSpeedFactor = useRef<number>(1);
  const gifFrameCount = useRef<number>(0);

  // WebM recording state (MediaRecorder fallback)
  const webmRecorderRef = useRef<MediaRecorder | null>(null);
  const webmCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const webmStartTime = useRef<number>(0);
  const webmDurationMs = useRef<number>(2000);
  const webmChunks = useRef<Blob[]>([]);
  const webmResolve = useRef<((blob: Blob | null) => void) | null>(null);
  const isRecordingWebm = useRef<boolean>(false);
  const webmSpeedFactor = useRef<number>(1);
  const webmFrameCounter = useRef<number>(0);
  const webmLastFrameTime = useRef<number>(0);

  // WebCodecs recording state (preferred for MP4 with speed control)
  const videoEncoderRef = useRef<VideoEncoder | null>(null);
  const muxerRef = useRef<WebCodecsMuxer | null>(null);
  const webCodecsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const webCodecsStartTime = useRef<number>(0);
  const webCodecsDurationMs = useRef<number>(2000);
  const webCodecsSpeedFactor = useRef<number>(1);
  const webCodecsFrameCount = useRef<number>(0);
  const webCodecsLastFrameTime = useRef<number>(0);
  const isRecordingWebCodecs = useRef<boolean>(false);
  const webCodecsResolve = useRef<((blob: Blob | null) => void) | null>(null);

  // Progress notification tracking
  const lastProgressNotificationTime = useRef<number>(0);

  // Start GIF recording
  const startGifRecording = useCallback(async (): Promise<Blob | null> => {
    const { default: GIF } = await import('gif.js');

    return startScreenshotGifRecording({
      sourceWidth: gl.domElement.width,
      sourceHeight: gl.domElement.height,
      downsample: gifDownsample,
      durationMs: gifDuration * 1000,
      speedFactor: gifSpeed,
      recordingQuality,
      hardwareConcurrency: navigator.hardwareConcurrency,
      workerScript: publicAsset('gif.worker.js'),
      gifRef,
      gifStartTimeRef: gifStartTime,
      gifLastFrameTimeRef: gifLastFrameTime,
      gifResolveRef: gifResolve,
      gifDurationMsRef: gifDurationMs,
      gifDownsampleFactorRef: gifDownsampleFactor,
      gifSpeedFactorRef: gifSpeedFactor,
      gifFrameCountRef: gifFrameCount,
      lastProgressNotificationTimeRef: lastProgressNotificationTime,
      setGifBlobUrl,
      setGifRenderProgress,
      setIsRecordingGif,
      createGifRecorder: (options) => new GIF(options),
    });
  }, [gl, setIsRecordingGif, setGifBlobUrl, setGifRenderProgress, gifDuration, gifDownsample, gifSpeed, recordingQuality]);

  // Start WebCodecs-based video recording (preferred for MP4 with proper speed control)
  const startWebCodecsRecording = useCallback(async (): Promise<Blob | null> => {
    const {
      BufferTarget,
      EncodedPacket,
      EncodedVideoPacketSource,
      Mp4OutputFormat,
      Output,
    } = await import('mediabunny');

    return startScreenshotWebCodecsRecording({
      sourceWidth: gl.domElement.width,
      sourceHeight: gl.domElement.height,
      downsample: gifDownsample,
      durationMs: gifDuration * 1000,
      speedFactor: gifSpeed,
      recordingQuality,
      videoEncoderRef,
      muxerRef,
      webCodecsCanvasRef,
      webCodecsStartTimeRef: webCodecsStartTime,
      webCodecsDurationMsRef: webCodecsDurationMs,
      webCodecsSpeedFactorRef: webCodecsSpeedFactor,
      webCodecsFrameCountRef: webCodecsFrameCount,
      webCodecsLastFrameTimeRef: webCodecsLastFrameTime,
      isRecordingWebCodecsRef: isRecordingWebCodecs,
      webCodecsResolveRef: webCodecsResolve,
      lastProgressNotificationTimeRef: lastProgressNotificationTime,
      setIsRecordingGif,
      createMuxer: () => {
        const target = new BufferTarget();
        const output = new Output({
          format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
          target,
        });
        const videoSource = new EncodedVideoPacketSource('avc');
        // Scale the muxer timescale by speed so sped-up frames stay on distinct
        // ticks (see getVideoTrackOptions). A fixed 30fps timescale dropped frames
        // at 2x/3x/4x.
        output.addVideoTrack(videoSource, getVideoTrackOptions(gifSpeed));
        let pendingVideoWrites = Promise.resolve();
        let videoWriteError: unknown = null;

        return {
          target,
          start: () => output.start(),
          addVideoChunk: (chunk, meta) => {
            const write = pendingVideoWrites.then(() =>
              videoSource.add(EncodedPacket.fromEncodedChunk(chunk), meta)
            );
            pendingVideoWrites = write.catch((error: unknown) => {
              videoWriteError ??= error;
            });
            return write;
          },
          finalize: async () => {
            await pendingVideoWrites;
            if (videoWriteError) {
              throw videoWriteError;
            }
            await output.finalize();
          },
        };
      },
    });
  }, [gl, gifDuration, gifDownsample, gifSpeed, recordingQuality, setIsRecordingGif]);

  // Finish WebCodecs recording
  const finishWebCodecsRecording = useCallback(async () => {
    await finishScreenshotWebCodecsRecording({
      videoEncoderRef,
      muxerRef,
      webCodecsCanvasRef,
      isRecordingWebCodecsRef: isRecordingWebCodecs,
      webCodecsFrameCountRef: webCodecsFrameCount,
      webCodecsResolveRef: webCodecsResolve,
      setGifBlobUrl,
      setIsRecordingGif,
    });
  }, [setGifBlobUrl, setIsRecordingGif]);

  // Start video recording using MediaRecorder (fallback for WebM or unsupported browsers)
  const startMediaRecorderRecording = useCallback((format: 'webm' | 'mp4'): Promise<Blob | null> => {
    return startScreenshotMediaRecorderRecording({
      format,
      sourceWidth: gl.domElement.width,
      sourceHeight: gl.domElement.height,
      downsample: gifDownsample,
      durationMs: gifDuration * 1000,
      speedFactor: gifSpeed,
      recordingQuality,
      webmRecorderRef,
      webmCanvasRef,
      webmStartTimeRef: webmStartTime,
      webmDurationMsRef: webmDurationMs,
      webmChunksRef: webmChunks,
      webmResolveRef: webmResolve,
      isRecordingWebmRef: isRecordingWebm,
      webmSpeedFactorRef: webmSpeedFactor,
      webmFrameCounterRef: webmFrameCounter,
      webmLastFrameTimeRef: webmLastFrameTime,
      lastProgressNotificationTimeRef: lastProgressNotificationTime,
      setGifBlobUrl,
      setIsRecordingGif,
    });
  }, [gl, setIsRecordingGif, setGifBlobUrl, gifDuration, gifDownsample, gifSpeed, recordingQuality]);

  // Start video recording - uses WebCodecs for MP4 when available, MediaRecorder as fallback
  const startVideoRecording = useCallback((format: 'webm' | 'mp4'): Promise<Blob | null> => {
    // Use WebCodecs for MP4 if supported (enables proper speed control via timestamps)
    const webCodecsSupported = isWebCodecsRuntimeSupported();
    if (getRecordingBackend(format, webCodecsSupported) === 'webcodecs') {
      appLogger.info('Using WebCodecs for MP4 recording');
      return startWebCodecsRecording();
    }
    // Fall back to MediaRecorder for WebM or when WebCodecs not available
    appLogger.info(`Using MediaRecorder for ${format} recording (WebCodecs supported: ${webCodecsSupported})`);
    return startMediaRecorderRecording(format);
  }, [startWebCodecsRecording, startMediaRecorderRecording]);

  // Combined recording function that chooses format
  const startRecording = useCallback((): Promise<Blob | null> => {
    if (recordingFormat === 'webm' || recordingFormat === 'mp4') {
      return startVideoRecording(recordingFormat);
    }
    return startGifRecording();
  }, [recordingFormat, startGifRecording, startVideoRecording]);

  // Helper to show progress notification
  const showProgressNotification = useCallback((elapsed: number, total: number) => {
    addNotification(
      'info',
      getRecordingProgressMessage(elapsed, total),
      4500
    );
  }, [addNotification]);

  const stopRecordingEarly = useScreenshotRecordingStop({
    gifRef,
    gifFrameCount,
    webCodecsFrameCount,
    webmRecorderRef,
    isRecordingWebCodecs,
    isRecordingWebm,
    lastProgressNotificationTimeRef: lastProgressNotificationTime,
    finishWebCodecsRecording,
    setGifRenderProgress,
    setIsRecordingGif,
  });

  useScreenshotRecordingFrameLoop({
    gl,
    scene,
    camera,
    addLogoToCanvas,
    screenshotHideLogo,
    gifRef,
    gifStartTimeRef: gifStartTime,
    gifLastFrameTimeRef: gifLastFrameTime,
    gifDurationMsRef: gifDurationMs,
    gifDownsampleFactorRef: gifDownsampleFactor,
    gifSpeedFactorRef: gifSpeedFactor,
    gifFrameCountRef: gifFrameCount,
    videoEncoderRef,
    webCodecsCanvasRef,
    webCodecsStartTimeRef: webCodecsStartTime,
    webCodecsDurationMsRef: webCodecsDurationMs,
    webCodecsSpeedFactorRef: webCodecsSpeedFactor,
    webCodecsFrameCountRef: webCodecsFrameCount,
    webCodecsLastFrameTimeRef: webCodecsLastFrameTime,
    isRecordingWebCodecsRef: isRecordingWebCodecs,
    webmRecorderRef,
    webmCanvasRef,
    webmStartTimeRef: webmStartTime,
    webmDurationMsRef: webmDurationMs,
    isRecordingWebmRef: isRecordingWebm,
    webmSpeedFactorRef: webmSpeedFactor,
    webmLastFrameTimeRef: webmLastFrameTime,
    lastProgressNotificationTimeRef: lastProgressNotificationTime,
    showProgressNotification,
    finishWebCodecsRecording,
    setGifRenderProgress,
    setIsRecordingGif,
  });

  // Register the recording callback (uses combined function that checks format)
  useEffect(() => {
    setRecordGif(startRecording);
    return () => setRecordGif(null);
  }, [startRecording, setRecordGif]);

  // Register the stop recording callback
  useEffect(() => {
    setStopRecording(stopRecordingEarly);
    return () => setStopRecording(null);
  }, [stopRecordingEarly, setStopRecording]);

  return null;
}
