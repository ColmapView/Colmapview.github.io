import { useCallback, useEffect } from 'react';
import * as THREE from 'three';
import type { ScreenshotCallback } from '../../store/stores/exportStore';
import type { AddLogoToCanvas } from './useScreenshotLogo';
import { getActiveWebGpuSplatCanvasHost } from './WebGpuSplatCanvasRuntime';

interface UseScreenshotBlobCaptureOptions {
  camera: THREE.Camera;
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  screenshotHideLogo: boolean;
  setGetScreenshotBlob: (callback: ScreenshotCallback | null) => void;
  addLogoToCanvas: AddLogoToCanvas;
}

export function useScreenshotBlobCapture({
  camera,
  gl,
  scene,
  screenshotHideLogo,
  setGetScreenshotBlob,
  addLogoToCanvas,
}: UseScreenshotBlobCaptureOptions): void {
  const captureScreenshotBlob = useCallback(async (): Promise<Blob | null> => {
    const canvas = document.createElement('canvas');
    canvas.width = gl.domElement.width;
    canvas.height = gl.domElement.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const splatHost = getActiveWebGpuSplatCanvasHost();
    if (splatHost && getComputedStyle(splatHost.canvas).opacity !== '0') {
      const splatFrame = await splatHost.captureFrame();
      ctx.drawImage(splatFrame, 0, 0, canvas.width, canvas.height);
    }
    // Reading the GPU layer can invalidate a previously rendered WebGL buffer.
    // Render and copy the overlay together, after the splat frame has been captured.
    gl.render(scene, camera);
    ctx.drawImage(gl.domElement, 0, 0);

    addLogoToCanvas(canvas, screenshotHideLogo);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  }, [gl, scene, camera, screenshotHideLogo, addLogoToCanvas]);

  useEffect(() => {
    setGetScreenshotBlob(captureScreenshotBlob);
    return () => setGetScreenshotBlob(null);
  }, [captureScreenshotBlob, setGetScreenshotBlob]);
}
