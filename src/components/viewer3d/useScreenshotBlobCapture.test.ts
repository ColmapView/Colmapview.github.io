import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useScreenshotBlobCapture } from './useScreenshotBlobCapture';
import { registerWebGpuSplatCanvasHost } from './WebGpuSplatCanvasRuntime';
import type { ScreenshotCallback } from '../../store/stores/exportStore';

afterEach(() => vi.restoreAllMocks());

describe('useScreenshotBlobCapture', () => {
  it.each([true, false])('composites the WebGPU layer only when visible: %s', async visible => {
    const splat = document.createElement('canvas');
    splat.style.opacity = visible ? '1' : '0';
    const capturedFrame = document.createElement('canvas');
    const captureFrame = vi.fn(async () => capturedFrame);
    const unregister = registerWebGpuSplatCanvasHost({ canvas: splat, setFrameSnapshot: vi.fn(), captureFrame });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    const blob = new Blob(['screenshot'], { type: 'image/png' });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(blob));
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const gl = { domElement: canvas, render: vi.fn() };
    const setter = vi.fn<(value: ScreenshotCallback | null) => void>();
    const logo = vi.fn();
    const { unmount } = renderHook(() => useScreenshotBlobCapture({
      gl: gl as unknown as THREE.WebGLRenderer, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
      screenshotHideLogo: true, setGetScreenshotBlob: setter, addLogoToCanvas: logo,
    }));
    try {
      expect(await setter.mock.calls[0][0]!()).toBe(blob);
      expect(drawImage.mock.calls.map(call => call[0])).toEqual(visible ? [capturedFrame, canvas] : [canvas]);
      if (visible) expect(drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 640, 480]);
      if (visible) {
        expect(captureFrame).toHaveBeenCalledOnce();
        expect(drawImage.mock.invocationCallOrder[0]).toBeLessThan(gl.render.mock.invocationCallOrder[0]);
      } else expect(captureFrame).not.toHaveBeenCalled();
      expect(gl.render.mock.invocationCallOrder[0]).toBeLessThan(drawImage.mock.invocationCallOrder.at(-1)!);
      expect(logo).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), true);
    } finally { unmount(); unregister(); }
    expect(setter).toHaveBeenLastCalledWith(null);
  });
});
