import { useRef, useEffect, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useExportStore } from '../../store';
import { SCREENSHOT } from '../../theme';

export function ScreenshotCapture() {
  const { gl, scene, camera, size } = useThree();
  const screenshotTrigger = useExportStore((s) => s.screenshotTrigger);
  const screenshotSize = useExportStore((s) => s.screenshotSize);
  const screenshotFormat = useExportStore((s) => s.screenshotFormat);
  const screenshotHideLogo = useExportStore((s) => s.screenshotHideLogo);
  const lastTrigger = useRef(0);
  const logoRef = useRef<HTMLImageElement | null>(null);

  // Preload logo
  useEffect(() => {
    const img = new Image();
    img.src = '/LOGO.png';
    img.onload = () => { logoRef.current = img; };
  }, []);

  // Helper to add logo and download
  const addLogoAndDownload = useCallback((canvas: HTMLCanvasElement, format: string, hideLogo: boolean) => {
    const ctx = canvas.getContext('2d')!;
    const logo = logoRef.current;

    if (logo && !hideLogo) {
      // Scale logo to match the viewport-relative size on screen
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

    const mimeType = `image/${format}`;
    const ext = format === 'jpeg' ? 'jpg' : format;
    const quality = format === 'jpeg' ? 0.92 : undefined;

    const link = document.createElement('a');
    link.download = `colmap-view-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.${ext}`;
    link.href = canvas.toDataURL(mimeType, quality);
    link.click();
  }, []);

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
