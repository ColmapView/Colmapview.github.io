import { useCallback, useEffect } from 'react';
import * as THREE from 'three';
import type { ScreenshotCallback } from '../../store/stores/exportStore';
import type { AddLogoToCanvas } from './useScreenshotLogo';

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
    gl.render(scene, camera);

    const canvas = document.createElement('canvas');
    canvas.width = gl.domElement.width;
    canvas.height = gl.domElement.height;
    const ctx = canvas.getContext('2d')!;
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
