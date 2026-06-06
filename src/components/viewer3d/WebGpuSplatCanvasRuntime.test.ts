import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createWebGpuSplatCameraSnapshot,
  createWebGpuSplatFrameSnapshot,
  createWebGpuSplatViewportSnapshot,
  getActiveWebGpuSplatCanvasHost,
  registerWebGpuSplatCanvasHost,
  resizeWebGpuSplatCanvas,
  syncWebGpuSplatFrameSnapshot,
} from './WebGpuSplatCanvasRuntime';

describe('WebGPU splat canvas runtime', () => {
  it('creates viewport snapshots with stable pixel dimensions', () => {
    expect(createWebGpuSplatViewportSnapshot(320.4, 180.2, 2)).toEqual({
      cssWidth: 320.4,
      cssHeight: 180.2,
      pixelWidth: 641,
      pixelHeight: 360,
      dpr: 2,
    });
    expect(createWebGpuSplatViewportSnapshot(0, -1, Number.NaN)).toEqual({
      cssWidth: 1,
      cssHeight: 1,
      pixelWidth: 1,
      pixelHeight: 1,
      dpr: 1,
    });
  });

  it('resizes a canvas to CSS and device-pixel dimensions', () => {
    const canvas = document.createElement('canvas');
    const viewport = createWebGpuSplatViewportSnapshot(400, 250, 1.5);

    expect(resizeWebGpuSplatCanvas(canvas, viewport)).toBe(true);
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(375);
    expect(canvas.style.width).toBe('400px');
    expect(canvas.style.height).toBe('250px');
    expect(resizeWebGpuSplatCanvas(canvas, viewport)).toBe(false);
  });

  it('captures camera matrices without aliasing mutable Three arrays', () => {
    const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
    camera.position.set(1, 2, 3);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const snapshot = createWebGpuSplatCameraSnapshot(camera);
    const originalFirst = snapshot.worldMatrix[12];
    camera.position.set(4, 5, 6);
    camera.updateMatrixWorld(true);

    expect(snapshot.kind).toBe('perspective');
    expect(snapshot.position).toEqual([1, 2, 3]);
    expect(snapshot.near).toBe(0.1);
    expect(snapshot.far).toBe(100);
    expect(snapshot.worldMatrix[12]).toBe(originalFirst);
  });

  it('routes frame snapshots to the active canvas host', () => {
    const canvas = document.createElement('canvas');
    let calls = 0;
    const unregister = registerWebGpuSplatCanvasHost({
      canvas,
      setFrameSnapshot(snapshot) {
        calls += 1;
        resizeWebGpuSplatCanvas(canvas, snapshot.viewport);
      },
    });
    const camera = new THREE.PerspectiveCamera();

    expect(getActiveWebGpuSplatCanvasHost()?.canvas).toBe(canvas);
    syncWebGpuSplatFrameSnapshot(createWebGpuSplatFrameSnapshot({
      camera,
      width: 100,
      height: 50,
      dpr: 2,
    }));

    expect(calls).toBe(1);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(100);

    unregister();
    expect(getActiveWebGpuSplatCanvasHost()).toBeNull();
  });
});
