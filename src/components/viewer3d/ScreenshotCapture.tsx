import { useRef, useEffect, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import GIF from 'gif.js';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { useExportStore } from '../../store';
import { useNotificationStore } from '../../store/stores/notificationStore';
import { SCREENSHOT } from '../../theme';
import { publicAsset } from '../../utils/paths';

// Recording settings
const RECORDING_FPS = 30;
const FRAME_DELAY = 1000 / RECORDING_FPS;

// Quality presets for GIF (1-30, lower is better quality)
const GIF_QUALITY = {
  low: 20,
  medium: 10,
  high: 5,
  ultra: 1,
} as const;

// Calculate video bitrate based on resolution and quality
// Returns bits per second
function getVideoBitrate(width: number, height: number, quality: 'low' | 'medium' | 'high' | 'ultra'): number {
  const pixels = width * height;
  // Base bitrate per pixel (bits per pixel per second)
  // Adjusted for H.264 High profile efficiency
  const bppMultiplier = {
    low: 0.05,      // ~2.5 Mbps at 720p, ~5 Mbps at 1080p
    medium: 0.1,    // ~5 Mbps at 720p, ~10 Mbps at 1080p
    high: 0.2,      // ~10 Mbps at 720p, ~20 Mbps at 1080p
    ultra: 0.4,     // ~20 Mbps at 720p, ~40 Mbps at 1080p
  };
  const baseBitrate = pixels * bppMultiplier[quality] * RECORDING_FPS;
  // Clamp between reasonable min/max
  const minBitrate = { low: 2_000_000, medium: 5_000_000, high: 15_000_000, ultra: 30_000_000 };
  const maxBitrate = { low: 10_000_000, medium: 30_000_000, high: 80_000_000, ultra: 150_000_000 };
  return Math.max(minBitrate[quality], Math.min(maxBitrate[quality], baseBitrate));
}

export function ScreenshotCapture() {
  const { gl, scene, camera, size } = useThree();
  const screenshotTrigger = useExportStore((s) => s.screenshotTrigger);
  const screenshotSize = useExportStore((s) => s.screenshotSize);
  const screenshotFormat = useExportStore((s) => s.screenshotFormat);
  const screenshotHideLogo = useExportStore((s) => s.screenshotHideLogo);
  const setGetScreenshotBlob = useExportStore((s) => s.setGetScreenshotBlob);
  const setRecordGif = useExportStore((s) => s.setRecordGif);
  const setStopRecording = useExportStore((s) => s.setStopRecording);
  const setIsRecordingGif = useExportStore((s) => s.setIsRecordingGif);
  const setGifRenderProgress = useExportStore((s) => s.setGifRenderProgress);
  const setGifBlobUrl = useExportStore((s) => s.setGifBlobUrl);
  const gifDuration = useExportStore((s) => s.gifDuration);
  const gifDownsample = useExportStore((s) => s.gifDownsample);
  const gifSpeed = useExportStore((s) => s.gifSpeed);
  const recordingQuality = useExportStore((s) => s.recordingQuality);
  const recordingFormat = useExportStore((s) => s.recordingFormat);
  const lastTrigger = useRef(0);
  const logoRef = useRef<HTMLImageElement | null>(null);

  // GIF recording state
  const gifRef = useRef<GIF | null>(null);
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
  const muxerRef = useRef<Muxer<ArrayBufferTarget> | null>(null);
  const webCodecsCanvasRef = useRef<HTMLCanvasElement | OffscreenCanvas | null>(null);
  const webCodecsStartTime = useRef<number>(0);
  const webCodecsDurationMs = useRef<number>(2000);
  const webCodecsSpeedFactor = useRef<number>(1);
  const webCodecsFrameCount = useRef<number>(0);
  const webCodecsLastFrameTime = useRef<number>(0);
  const isRecordingWebCodecs = useRef<boolean>(false);
  const webCodecsResolve = useRef<((blob: Blob | null) => void) | null>(null);

  // Progress notification tracking
  const lastProgressNotificationTime = useRef<number>(0);

  // Preload logo
  useEffect(() => {
    const img = new Image();
    img.src = publicAsset('LOGO.png');
    img.onload = () => { logoRef.current = img; };
  }, []);

  // Helper to add logo to canvas (shared between download and blob capture)
  const addLogoToCanvas = useCallback((canvas: HTMLCanvasElement, hideLogo: boolean) => {
    const ctx = canvas.getContext('2d')!;
    const logo = logoRef.current;

    if (logo && !hideLogo) {
      const logoHeight = canvas.height * SCREENSHOT.logoHeightPercent;
      const logoWidth = (logo.width / logo.height) * logoHeight;
      const padding = canvas.height * SCREENSHOT.paddingPercent;

      ctx.globalAlpha = SCREENSHOT.logoAlpha;
      ctx.drawImage(
        logo,
        padding,
        canvas.height - logoHeight - padding,
        logoWidth,
        logoHeight
      );
      ctx.globalAlpha = 1;
    }
  }, []);

  // Capture screenshot as blob (for Web Share API)
  const captureScreenshotBlob = useCallback(async (): Promise<Blob | null> => {
    // Render current frame
    gl.render(scene, camera);

    // Copy to new canvas to add logo
    const canvas = document.createElement('canvas');
    canvas.width = gl.domElement.width;
    canvas.height = gl.domElement.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(gl.domElement, 0, 0);

    // Add logo
    addLogoToCanvas(canvas, screenshotHideLogo);

    // Convert to blob
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  }, [gl, scene, camera, screenshotHideLogo, addLogoToCanvas]);

  // Register the blob capture callback
  useEffect(() => {
    setGetScreenshotBlob(captureScreenshotBlob);
    return () => setGetScreenshotBlob(null);
  }, [captureScreenshotBlob, setGetScreenshotBlob]);

  // Start GIF recording
  const startGifRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      // Calculate downsampled dimensions
      const width = Math.floor(gl.domElement.width / gifDownsample);
      const height = Math.floor(gl.domElement.height / gifDownsample);

      // Create GIF encoder with quality preset
      // Use more workers for faster encoding (navigator.hardwareConcurrency gives CPU core count)
      const workerCount = Math.min(navigator.hardwareConcurrency || 4, 8);
      const gif = new GIF({
        workers: workerCount,
        quality: GIF_QUALITY[recordingQuality],
        width,
        height,
        workerScript: publicAsset('gif.worker.js'),
      });

      gif.on('finished', (blob: Blob) => {
        // Store blob URL for download button
        const url = URL.createObjectURL(blob);
        setGifBlobUrl(url);
        setGifRenderProgress(null);
        setIsRecordingGif(false);
        resolve(blob);
      });

      gif.on('progress', (p: number) => {
        const percent = Math.round(p * 100);
        setGifRenderProgress(percent);
      });

      gif.on('abort', () => {
        setGifRenderProgress(null);
        setIsRecordingGif(false);
        resolve(null);
      });

      gifRef.current = gif;
      gifStartTime.current = performance.now();
      gifLastFrameTime.current = 0;
      gifResolve.current = resolve;
      gifDurationMs.current = gifDuration * 1000;
      gifDownsampleFactor.current = gifDownsample;
      gifSpeedFactor.current = gifSpeed;
      gifFrameCount.current = 0;
      lastProgressNotificationTime.current = 0;
      setGifRenderProgress(null);
      setIsRecordingGif(true);
    });
  }, [gl, setIsRecordingGif, setGifBlobUrl, gifDuration, gifDownsample, gifSpeed, recordingQuality]);

  // Check if WebCodecs is supported
  const isWebCodecsSupported = useCallback((): boolean => {
    return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  }, []);

  // Start WebCodecs-based video recording (preferred for MP4 with proper speed control)
  const startWebCodecsRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve, reject) => {
      const downsample = gifDownsample;
      // Ensure dimensions are even (required by H.264)
      const width = Math.floor(gl.domElement.width / downsample) & ~1;
      const height = Math.floor(gl.domElement.height / downsample) & ~1;

      // Calculate bitrate based on resolution and quality
      const bitrate = getVideoBitrate(width, height, recordingQuality);
      console.log(`WebCodecs recording: ${width}x${height}, bitrate=${(bitrate/1_000_000).toFixed(1)}Mbps`);

      // Create muxer
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width,
          height,
        },
        fastStart: 'in-memory',
      });

      // Create encoder
      const encoder = new VideoEncoder({
        output: (chunk, meta) => {
          muxer.addVideoChunk(chunk, meta ?? undefined);
        },
        error: (e) => {
          console.error('VideoEncoder error:', e);
          setIsRecordingGif(false);
          isRecordingWebCodecs.current = false;
          reject(e);
        },
      });

      // Choose AVC codec based on resolution
      // Using High profile (64) for better quality than Baseline (42)
      // Level 3.1 (0x1f): max 921,600 pixels (1280x720)
      // Level 4.0 (0x28): max 2,073,600 pixels (1920x1080)
      // Level 5.1 (0x33): max 8,912,896 pixels (4096x2160)
      const pixels = width * height;
      let codec = 'avc1.64001f'; // High profile, Level 3.1
      if (pixels > 921600) codec = 'avc1.640028'; // High profile, Level 4.0
      if (pixels > 2073600) codec = 'avc1.640033'; // High profile, Level 5.1

      try {
        encoder.configure({
          codec,
          width,
          height,
          bitrate,
          framerate: RECORDING_FPS,
        });
        console.log(`VideoEncoder configured: ${codec}, ${width}x${height}, ${(bitrate/1_000_000).toFixed(1)}Mbps`);
      } catch (e) {
        console.error('VideoEncoder configure failed:', e);
        reject(e);
        return;
      }

      // Create offscreen canvas for recording
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      // Store refs
      videoEncoderRef.current = encoder;
      muxerRef.current = muxer;
      webCodecsCanvasRef.current = canvas;
      webCodecsStartTime.current = performance.now();
      webCodecsDurationMs.current = gifDuration * 1000;
      webCodecsSpeedFactor.current = gifSpeed;
      webCodecsFrameCount.current = 0;
      webCodecsLastFrameTime.current = 0;
      isRecordingWebCodecs.current = true;
      webCodecsResolve.current = resolve;
      lastProgressNotificationTime.current = 0;

      setIsRecordingGif(true);
    });
  }, [gl, gifDuration, gifDownsample, gifSpeed, recordingQuality, setIsRecordingGif]);

  // Finish WebCodecs recording
  const finishWebCodecsRecording = useCallback(async () => {
    if (!videoEncoderRef.current || !muxerRef.current) {
      console.log('finishWebCodecsRecording: refs already null');
      return;
    }

    console.log(`WebCodecs recording complete: ${webCodecsFrameCount.current} frames`);

    const encoder = videoEncoderRef.current;
    const muxer = muxerRef.current;
    const resolve = webCodecsResolve.current;

    // Clear refs to prevent double-finish
    videoEncoderRef.current = null;
    muxerRef.current = null;
    webCodecsCanvasRef.current = null;
    isRecordingWebCodecs.current = false;

    try {
      console.log('Flushing encoder...');
      await encoder.flush();
      console.log('Finalizing muxer...');
      muxer.finalize();

      const { buffer } = muxer.target;
      console.log('MP4 blob size:', buffer.byteLength);
      const blob = new Blob([buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      setGifBlobUrl(url);
      setIsRecordingGif(false);

      resolve?.(blob);
    } catch (e) {
      console.error('Error finalizing WebCodecs recording:', e);
      setIsRecordingGif(false);
      resolve?.(null);
    }
  }, [setGifBlobUrl, setIsRecordingGif]);

  // Start video recording using MediaRecorder (fallback for WebM or unsupported browsers)
  const startMediaRecorderRecording = useCallback((format: 'webm' | 'mp4'): Promise<Blob | null> => {
    return new Promise((resolve) => {
      // Calculate downsampled dimensions
      const downsample = gifDownsample;
      const width = Math.floor(gl.domElement.width / downsample);
      const height = Math.floor(gl.domElement.height / downsample);

      // Create offscreen canvas for recording
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      webmCanvasRef.current = canvas;

      // Get canvas stream at fixed framerate
      const stream = canvas.captureStream(RECORDING_FPS);

      // Determine MIME type based on format and browser support
      let mimeType: string;
      let blobType: string;
      if (format === 'mp4') {
        // Try MP4 with H.264 codec
        if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
          mimeType = 'video/mp4;codecs=avc1';
          blobType = 'video/mp4';
        } else if (MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4';
          blobType = 'video/mp4';
        } else {
          // Fall back to WebM if MP4 not supported
          console.warn('MP4 not supported, falling back to WebM');
          mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';
          blobType = 'video/webm';
        }
      } else {
        mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm';
        blobType = 'video/webm';
      }

      // Calculate bitrate based on resolution and quality
      const bitrate = getVideoBitrate(width, height, recordingQuality);
      console.log(`MediaRecorder: ${width}x${height}, bitrate=${(bitrate/1_000_000).toFixed(1)}Mbps, format=${mimeType}`);

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: bitrate,
      });

      webmChunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          webmChunks.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(webmChunks.current, { type: blobType });
        const url = URL.createObjectURL(blob);
        setGifBlobUrl(url);
        setIsRecordingGif(false);
        isRecordingWebm.current = false;
        webmRecorderRef.current = null;
        webmCanvasRef.current = null;
        resolve(blob);
      };

      webmRecorderRef.current = recorder;
      webmStartTime.current = performance.now();
      webmLastFrameTime.current = 0;
      webmDurationMs.current = gifDuration * 1000;
      webmResolve.current = resolve;
      webmSpeedFactor.current = gifSpeed;
      webmFrameCounter.current = 0;
      isRecordingWebm.current = true;
      lastProgressNotificationTime.current = 0;

      recorder.start();
      setIsRecordingGif(true);
    });
  }, [gl, setIsRecordingGif, setGifBlobUrl, gifDuration, gifDownsample, gifSpeed, recordingQuality]);

  // Start video recording - uses WebCodecs for MP4 when available, MediaRecorder as fallback
  const startVideoRecording = useCallback((format: 'webm' | 'mp4'): Promise<Blob | null> => {
    // Use WebCodecs for MP4 if supported (enables proper speed control via timestamps)
    if (format === 'mp4' && isWebCodecsSupported()) {
      console.log('Using WebCodecs for MP4 recording');
      return startWebCodecsRecording();
    }
    // Fall back to MediaRecorder for WebM or when WebCodecs not available
    console.log(`Using MediaRecorder for ${format} recording (WebCodecs supported: ${isWebCodecsSupported()})`);
    return startMediaRecorderRecording(format);
  }, [isWebCodecsSupported, startWebCodecsRecording, startMediaRecorderRecording]);

  // Combined recording function that chooses format
  const startRecording = useCallback((): Promise<Blob | null> => {
    if (recordingFormat === 'webm' || recordingFormat === 'mp4') {
      return startVideoRecording(recordingFormat);
    }
    return startGifRecording();
  }, [recordingFormat, startGifRecording, startVideoRecording]);

  // Stop recording early
  const stopRecordingEarly = useCallback(() => {
    console.log('Stop recording requested');

    // Stop GIF recording
    if (gifRef.current) {
      console.log(`Stopping GIF recording early: ${gifFrameCount.current} frames captured`);
      lastProgressNotificationTime.current = 0;
      const gif = gifRef.current;
      gifRef.current = null;
      try {
        if (gifFrameCount.current > 0) {
          setGifRenderProgress(0);
          useNotificationStore.getState().addNotification(
            'info',
            `Rendering ${gifFrameCount.current} frames...`,
            3000
          );
          gif.render();
        } else {
          setIsRecordingGif(false);
          useNotificationStore.getState().addNotification('warning', 'No frames captured', 2000);
        }
      } catch (e) {
        console.error('gif.render() error:', e);
        setGifRenderProgress(null);
        setIsRecordingGif(false);
      }
      return;
    }

    // Stop WebCodecs recording
    if (isRecordingWebCodecs.current) {
      console.log(`Stopping WebCodecs recording early: ${webCodecsFrameCount.current} frames captured`);
      lastProgressNotificationTime.current = 0;
      finishWebCodecsRecording();
      return;
    }

    // Stop MediaRecorder recording
    if (isRecordingWebm.current && webmRecorderRef.current) {
      console.log('Stopping MediaRecorder recording early');
      lastProgressNotificationTime.current = 0;
      webmRecorderRef.current.stop();
      return;
    }
  }, [finishWebCodecsRecording, setGifRenderProgress, setIsRecordingGif]);

  // Helper to show progress notification
  const showProgressNotification = useCallback((elapsed: number, total: number) => {
    const elapsedSec = Math.floor(elapsed / 1000);
    const totalSec = Math.floor(total / 1000);
    useNotificationStore.getState().addNotification(
      'info',
      `Recording: ${elapsedSec}s / ${totalSec}s`,
      4500
    );
  }, []);

  // Capture frames during recording using useFrame
  useFrame(() => {
    // GIF recording
    if (gifRef.current) {
      const now = performance.now();
      const elapsed = now - gifStartTime.current;
      const duration = gifDurationMs.current;

      // Show progress notification every 5 seconds
      const elapsedSec = Math.floor(elapsed / 1000);
      if (elapsedSec !== lastProgressNotificationTime.current) {
        if (elapsedSec > 0 && elapsedSec % 5 === 0) {
          showProgressNotification(elapsed, duration);
        }
        lastProgressNotificationTime.current = elapsedSec;
      }

      // Check if recording is complete FIRST (before any rendering that might fail)
      if (elapsed >= duration) {
        lastProgressNotificationTime.current = 0;
        const gif = gifRef.current;
        gifRef.current = null;
        try {
          setGifRenderProgress(0);
          useNotificationStore.getState().addNotification(
            'info',
            `Rendering ${gifFrameCount.current} frames...`,
            3000
          );
          gif.render();
        } catch (e) {
          console.error('gif.render() error:', e);
          setGifRenderProgress(null);
          setIsRecordingGif(false);
        }
        return;
      }

      // Check if we should capture a frame (based on FPS)
      if (elapsed - gifLastFrameTime.current >= FRAME_DELAY) {
        gifLastFrameTime.current = elapsed;

        try {
          // Render and capture frame
          gl.render(scene, camera);

          // Create downsampled canvas
          const downsample = gifDownsampleFactor.current;
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(gl.domElement.width / downsample);
          canvas.height = Math.floor(gl.domElement.height / downsample);
          const ctx = canvas.getContext('2d')!;

          // Draw downsampled with antialiasing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(gl.domElement, 0, 0, canvas.width, canvas.height);

          // Add logo (scaled for downsampled size)
          addLogoToCanvas(canvas, screenshotHideLogo);

          // Add frame to GIF (divide delay by speed for faster playback)
          const frameDelay = Math.round(FRAME_DELAY / gifSpeedFactor.current);
          gifRef.current?.addFrame(canvas, { delay: frameDelay, copy: true });
          gifFrameCount.current++;
        } catch (e) {
          // Frame capture failed, skip this frame but continue recording
          console.warn('GIF frame capture failed:', e);
        }
      }
    }

    // WebCodecs recording - capture frames with speed-adjusted timestamps
    if (isRecordingWebCodecs.current && videoEncoderRef.current && webCodecsCanvasRef.current) {
      const now = performance.now();
      const elapsed = now - webCodecsStartTime.current;

      // Log progress and show notification every 5 seconds
      const elapsedSec = Math.floor(elapsed / 1000);
      if (elapsedSec !== lastProgressNotificationTime.current) {
        console.log(`MP4: ${elapsedSec}s, ${webCodecsFrameCount.current} frames`);
        if (elapsedSec > 0 && elapsedSec % 5 === 0) {
          showProgressNotification(elapsed, webCodecsDurationMs.current);
        }
        lastProgressNotificationTime.current = elapsedSec;
      }

      // Check if recording is complete FIRST
      if (elapsed >= webCodecsDurationMs.current) {
        lastProgressNotificationTime.current = 0;
        finishWebCodecsRecording();
        return;
      }

      // Capture at RECORDING_FPS
      if (elapsed - webCodecsLastFrameTime.current >= FRAME_DELAY) {
        webCodecsLastFrameTime.current = elapsed;

        try {
          // Render to offscreen canvas
          gl.render(scene, camera);
          const canvas = webCodecsCanvasRef.current as HTMLCanvasElement;
          const ctx = canvas.getContext('2d')!;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(gl.domElement, 0, 0, canvas.width, canvas.height);
          addLogoToCanvas(canvas, screenshotHideLogo);

          // Create VideoFrame with speed-adjusted timestamp
          // timestamp is in microseconds: (frameNumber * 1e6 / fps) / speed
          // Higher speed = smaller timestamp gaps = faster playback
          const timestamp = Math.round((webCodecsFrameCount.current * 1e6 / RECORDING_FPS) / webCodecsSpeedFactor.current);
          const frame = new VideoFrame(canvas, { timestamp });

          // Encode frame (keyframe every 30 frames for seeking)
          videoEncoderRef.current?.encode(frame, { keyFrame: webCodecsFrameCount.current % 30 === 0 });
          frame.close();
          webCodecsFrameCount.current++;
        } catch (e) {
          console.warn('WebCodecs frame capture failed:', e);
        }
      }
    }

    // MediaRecorder fallback recording - capture at fixed rate
    if (isRecordingWebm.current && webmCanvasRef.current && webmRecorderRef.current) {
      const now = performance.now();
      const elapsed = now - webmStartTime.current;
      const totalDuration = webmDurationMs.current / webmSpeedFactor.current;

      // Show progress notification every 5 seconds
      const elapsedSec = Math.floor(elapsed / 1000);
      if (elapsedSec > 0 && elapsedSec % 5 === 0 && elapsedSec !== lastProgressNotificationTime.current) {
        lastProgressNotificationTime.current = elapsedSec;
        showProgressNotification(elapsed, totalDuration);
      }

      // Check if recording is complete FIRST
      // For MediaRecorder, we record for duration/speed time to get the right final length
      if (elapsed >= totalDuration) {
        lastProgressNotificationTime.current = 0;
        webmRecorderRef.current.stop();
        return;
      }

      // Capture at RECORDING_FPS for smooth video
      if (elapsed - webmLastFrameTime.current >= FRAME_DELAY) {
        webmLastFrameTime.current = elapsed;

        try {
          // Render and draw frame
          gl.render(scene, camera);

          const ctx = webmCanvasRef.current.getContext('2d')!;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(gl.domElement, 0, 0, webmCanvasRef.current.width, webmCanvasRef.current.height);

          // Add logo
          addLogoToCanvas(webmCanvasRef.current, screenshotHideLogo);
        } catch (e) {
          console.warn('MediaRecorder frame capture failed:', e);
        }
      }
    }
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

  // Helper to add logo and download
  const addLogoAndDownload = useCallback((canvas: HTMLCanvasElement, format: string, hideLogo: boolean) => {
    addLogoToCanvas(canvas, hideLogo);

    const mimeType = `image/${format}`;
    const ext = format === 'jpeg' ? 'jpg' : format;
    const quality = format === 'jpeg' ? 0.92 : undefined;

    const link = document.createElement('a');
    link.download = `colmap-view-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.${ext}`;
    link.href = canvas.toDataURL(mimeType, quality);
    link.click();
  }, [addLogoToCanvas]);

  useEffect(() => {
    if (screenshotTrigger > 0 && screenshotTrigger !== lastTrigger.current) {
      lastTrigger.current = screenshotTrigger;

      let width = size.width;
      let height = size.height;

      // Parse custom size if not 'current'
      if (screenshotSize !== 'current') {
        const [w, h] = screenshotSize.split('x').map(Number);
        width = w;
        height = h;
      }

      // For custom sizes, use offscreen rendering
      if (screenshotSize !== 'current') {
        const renderTarget = new THREE.WebGLRenderTarget(width, height, {
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
        });

        // Clone camera to avoid mutating the global camera's aspect ratio
        const tempCamera = camera.clone() as THREE.PerspectiveCamera;
        tempCamera.aspect = width / height;
        tempCamera.updateProjectionMatrix();

        // Render to target using cloned camera
        gl.setRenderTarget(renderTarget);
        gl.render(scene, tempCamera);
        gl.setRenderTarget(null);

        // Read pixels
        const pixels = new Uint8Array(width * height * 4);
        gl.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

        // Create canvas and flip vertically (WebGL reads bottom-up)
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.createImageData(width, height);

        // Flip vertically using row-based copy (much faster than per-pixel)
        const rowSize = width * 4;
        for (let y = 0; y < height; y++) {
          const srcRow = (height - 1 - y) * rowSize;
          const dstRow = y * rowSize;
          imageData.data.set(pixels.subarray(srcRow, srcRow + rowSize), dstRow);
        }
        ctx.putImageData(imageData, 0, 0);

        addLogoAndDownload(canvas, screenshotFormat, screenshotHideLogo);
        renderTarget.dispose();
      } else {
        // Current size - use canvas directly
        gl.render(scene, camera);

        // Copy to new canvas to add logo
        const canvas = document.createElement('canvas');
        canvas.width = gl.domElement.width;
        canvas.height = gl.domElement.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(gl.domElement, 0, 0);

        addLogoAndDownload(canvas, screenshotFormat, screenshotHideLogo);
      }
    }
  }, [screenshotTrigger, screenshotSize, screenshotFormat, screenshotHideLogo, gl, scene, camera, size, addLogoAndDownload]);

  return null;
}
