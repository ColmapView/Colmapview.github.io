import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  buildCanvas2dContext,
  buildImageCacheCanvas,
  buildRecordingRenderer,
} from '../../test/builders';
import {
  captureDownsampledRecordingFrame,
  createRecordingCanvas,
  drawRecordingFrameToCanvas,
} from './screenshotRecordingCanvas';

function createRecordingSubject() {
  return {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
  };
}

describe('screenshot recording canvas helpers', () => {
  it('creates recording canvases with explicit dimensions', () => {
    const canvas = createRecordingCanvas(640, 360, () => buildImageCacheCanvas());

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
  });

  it('captures a downsampled frame, draws the renderer canvas, and applies logo policy', () => {
    const drawImage = vi.fn();
    const context = buildCanvas2dContext({
      drawImage,
    });
    const sourceCanvas = buildImageCacheCanvas({ width: 1921, height: 1081 });
    const gl = buildRecordingRenderer({ domElement: sourceCanvas, render: vi.fn() });
    const addLogoToCanvas = vi.fn();

    const canvas = captureDownsampledRecordingFrame({
      gl,
      ...createRecordingSubject(),
      downsample: 2,
      createCanvas: () => buildImageCacheCanvas({ getContext: vi.fn(() => context) }),
      addLogoToCanvas,
      screenshotHideLogo: true,
    });

    expect(canvas.width).toBe(960);
    expect(canvas.height).toBe(540);
    expect(gl.render).toHaveBeenCalledOnce();
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe('high');
    expect(drawImage).toHaveBeenCalledWith(sourceCanvas, 0, 0, 960, 540);
    expect(addLogoToCanvas).toHaveBeenCalledWith(canvas, true);
  });

  it('draws into an existing recording canvas', () => {
    const drawImage = vi.fn();
    const context = buildCanvas2dContext({
      drawImage,
    });
    const targetCanvas = buildImageCacheCanvas({
      width: 800,
      height: 450,
      getContext: vi.fn(() => context),
    });
    const sourceCanvas = buildImageCacheCanvas({ width: 1600, height: 900 });
    const gl = buildRecordingRenderer({ domElement: sourceCanvas, render: vi.fn() });
    const addLogoToCanvas = vi.fn();

    drawRecordingFrameToCanvas({
      gl,
      ...createRecordingSubject(),
      canvas: targetCanvas,
      addLogoToCanvas,
      screenshotHideLogo: false,
    });

    expect(gl.render).toHaveBeenCalledOnce();
    expect(drawImage).toHaveBeenCalledWith(sourceCanvas, 0, 0, 800, 450);
    expect(addLogoToCanvas).toHaveBeenCalledWith(targetCanvas, false);
  });

  it('throws a clear error when the recording canvas has no 2D context', () => {
    expect(() => drawRecordingFrameToCanvas({
      gl: buildRecordingRenderer(),
      ...createRecordingSubject(),
      canvas: buildImageCacheCanvas({ getContext: vi.fn(() => null) }),
      addLogoToCanvas: vi.fn(),
      screenshotHideLogo: false,
    })).toThrow('Recording canvas 2D context is unavailable');
  });
});
