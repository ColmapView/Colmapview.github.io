import { useRef, useEffect, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import GIF from 'gif.js';
import { useExportStore } from '../../store';
import { SCREENSHOT } from '../../theme';
import { publicAsset } from '../../utils/paths';

// Recording settings
const RECORDING_FPS = 30;
const FRAME_DELAY = 1000 / RECORDING_FPS;

// Quality presets: bitrate (video) and gif quality (1-30, lower is better)
const QUALITY_PRESETS = {
  low: { bitrate: 5000000, gifQuality: 15 },      // 5 Mbps
  medium: { bitrate: 10000000, gifQuality: 10 },  // 10 Mbps
  high: { bitrate: 20000000, gifQuality: 5 },     // 20 Mbps
  ultra: { bitrate: 40000000, gifQuality: 2 },    // 40 Mbps
} as const;

export function ScreenshotCapture() {
  const { gl, scene, camera, size } = useThree();
  const screenshotTrigger = useExportStore((s) => s.screenshotTrigger);
  const screenshotSize = useExportStore((s) => s.screenshotSize);
  const screenshotFormat = useExportStore((s) => s.screenshotFormat);
  const screenshotHideLogo = useExportStore((s) => s.screenshotHideLogo);
  const setGetScreenshotBlob = useExportStore((s) => s.setGetScreenshotBlob);
  const setRecordGif = useExportStore((s) => s.setRecordGif);
  const setIsRecordingGif = useExportStore((s) => s.setIsRecordingGif);
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

  // WebM recording state
  const webmRecorderRef = useRef<MediaRecorder | null>(null);
  const webmCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const webmStartTime = useRef<number>(0);
  const webmDurationMs = useRef<number>(2000);
  const webmChunks = useRef<Blob[]>([]);
  const webmResolve = useRef<((blob: Blob | null) => void) | null>(null);
  const isRecordingWebm = useRef<boolean>(false);
  const webmSpeedFactor = useRef<number>(1);
  const webmFrameCounter = useRef<number>(0);

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
      const qualityPreset = QUALITY_PRESETS[recordingQuality];
      const gif = new GIF({
        workers: 2,
        quality: qualityPreset.gifQuality,
        width,
        height,
        workerScript: publicAsset('gif.worker.js'),
      });

      gif.on('finished', (blob: Blob) => {
        // Store blob URL for download button
        const url = URL.createObjectURL(blob);
        setGifBlobUrl(url);
        setIsRecordingGif(false);
        resolve(blob);
      });

      gifRef.current = gif;
      gifStartTime.current = performance.now();
      gifLastFrameTime.current = 0;
      gifResolve.current = resolve;
      gifDurationMs.current = gifDuration * 1000;
      gifDownsampleFactor.current = gifDownsample;
      gifSpeedFactor.current = gifSpeed;
      setIsRecordingGif(true);
    });
  }, [gl, setIsRecordingGif, setGifBlobUrl, gifDuration, gifDownsample, gifSpeed, recordingQuality]);

  // Start video recording (WebM or MP4)
  const startVideoRecording = useCallback((format: 'webm' | 'mp4'): Promise<Blob | null> => {
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

      // Get canvas stream
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

      const qualityPreset = QUALITY_PRESETS[recordingQuality];
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: qualityPreset.bitrate,
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
      webmDurationMs.current = gifDuration * 1000;
      webmResolve.current = resolve;
      webmSpeedFactor.current = gifSpeed;
      webmFrameCounter.current = 0;
      isRecordingWebm.current = true;

      recorder.start();
      setIsRecordingGif(true);
    });
  }, [gl, setIsRecordingGif, setGifBlobUrl, gifDuration, gifDownsample, gifSpeed, recordingQuality]);

  // Combined recording function that chooses format
  const startRecording = useCallback((): Promise<Blob | null> => {
    if (recordingFormat === 'webm' || recordingFormat === 'mp4') {
      return startVideoRecording(recordingFormat);
    }
    return startGifRecording();
  }, [recordingFormat, startGifRecording, startVideoRecording]);

  // Capture frames during recording using useFrame
  useFrame(() => {
    // GIF recording
    if (gifRef.current) {
      const now = performance.now();
      const elapsed = now - gifStartTime.current;

      // Check if we should capture a frame (based on FPS)
      if (elapsed - gifLastFrameTime.current >= FRAME_DELAY) {
        gifLastFrameTime.current = elapsed;

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
        gifRef.current.addFrame(canvas, { delay: frameDelay, copy: true });
      }

      // Check if recording is complete
      if (elapsed >= gifDurationMs.current) {
        const gif = gifRef.current;
        gifRef.current = null;
        gif.render();
      }
    }

    // WebM/MP4 recording - always capture every frame for best quality
    if (isRecordingWebm.current && webmCanvasRef.current && webmRecorderRef.current) {
      const now = performance.now();
      const elapsed = now - webmStartTime.current;

      // Render and draw every frame for smooth video
      gl.render(scene, camera);

      const ctx = webmCanvasRef.current.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(gl.domElement, 0, 0, webmCanvasRef.current.width, webmCanvasRef.current.height);

      // Add logo
      addLogoToCanvas(webmCanvasRef.current, screenshotHideLogo);

      // Check if recording is complete
      if (elapsed >= webmDurationMs.current) {
        webmRecorderRef.current.stop();
      }
    }
  });

  // Register the recording callback (uses combined function that checks format)
  useEffect(() => {
    setRecordGif(startRecording);
    return () => setRecordGif(null);
  }, [startRecording, setRecordGif]);

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
