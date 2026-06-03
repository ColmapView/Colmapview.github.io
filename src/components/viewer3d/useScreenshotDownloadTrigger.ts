import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildTimestampedFilename, downloadUrl } from '../../utils/download';
import {
  getScreenshotDimensions,
  getScreenshotImageConfig,
  isCustomScreenshotSize,
} from './screenshotCaptureViewModel';
import { cloneCameraForScreenshotRender } from './screenshotCameraPolicy';
import type { AddLogoToCanvas } from './useScreenshotLogo';
import type { ScreenshotFormat, ScreenshotSize } from '../../store/types';

interface UseScreenshotDownloadTriggerOptions {
  camera: THREE.Camera;
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  size: { width: number; height: number };
  screenshotTrigger: number;
  screenshotSize: ScreenshotSize;
  screenshotFormat: ScreenshotFormat;
  screenshotHideLogo: boolean;
  addLogoToCanvas: AddLogoToCanvas;
}

export function useScreenshotDownloadTrigger({
  camera,
  gl,
  scene,
  size,
  screenshotTrigger,
  screenshotSize,
  screenshotFormat,
  screenshotHideLogo,
  addLogoToCanvas,
}: UseScreenshotDownloadTriggerOptions): void {
  const lastTrigger = useRef(0);

  const addLogoAndDownload = useCallback((canvas: HTMLCanvasElement, format: ScreenshotFormat, hideLogo: boolean) => {
    addLogoToCanvas(canvas, hideLogo);

    const { mimeType, ext, quality } = getScreenshotImageConfig(format);

    downloadUrl(canvas.toDataURL(mimeType, quality), buildTimestampedFilename('colmap-view', ext));
  }, [addLogoToCanvas]);

  useEffect(() => {
    if (screenshotTrigger <= 0 || screenshotTrigger === lastTrigger.current) {
      return;
    }

    lastTrigger.current = screenshotTrigger;

    const { width, height } = getScreenshotDimensions(screenshotSize, size.width, size.height);

    if (isCustomScreenshotSize(screenshotSize)) {
      const renderTarget = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      });

      const tempCamera = cloneCameraForScreenshotRender(camera, width / height);

      gl.setRenderTarget(renderTarget);
      gl.render(scene, tempCamera);
      gl.setRenderTarget(null);

      const pixels = new Uint8Array(width * height * 4);
      gl.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.createImageData(width, height);

      const rowSize = width * 4;
      for (let y = 0; y < height; y++) {
        const srcRow = (height - 1 - y) * rowSize;
        const dstRow = y * rowSize;
        imageData.data.set(pixels.subarray(srcRow, srcRow + rowSize), dstRow);
      }
      ctx.putImageData(imageData, 0, 0);

      addLogoAndDownload(canvas, screenshotFormat, screenshotHideLogo);
      renderTarget.dispose();
      return;
    }

    gl.render(scene, camera);

    const canvas = document.createElement('canvas');
    canvas.width = gl.domElement.width;
    canvas.height = gl.domElement.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(gl.domElement, 0, 0);

    addLogoAndDownload(canvas, screenshotFormat, screenshotHideLogo);
  }, [
    screenshotTrigger,
    screenshotSize,
    screenshotFormat,
    screenshotHideLogo,
    gl,
    scene,
    camera,
    size,
    addLogoAndDownload,
  ]);
}
