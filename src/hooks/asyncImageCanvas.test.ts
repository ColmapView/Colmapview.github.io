import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCanvas2dContext, buildImageBitmap, buildImageCacheCanvas } from '../test/builders';
import {
  createBrowserImageCacheCanvas,
  drawImageBitmapToCacheCanvas,
  type ImageCacheCanvas,
} from './asyncImageCanvas';

describe('async image canvas helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a resized canvas, draws the bitmap, and closes it', () => {
    const bitmap = buildImageBitmap({ width: 4000, height: 2000, close: vi.fn() });
    const drawImage = vi.fn();
    const context = buildCanvas2dContext({ drawImage });
    const createCanvas = vi.fn((width: number, height: number): ImageCacheCanvas =>
      buildImageCacheCanvas({
        width,
        height,
        getContext: vi.fn(() => context),
      })
    );

    const canvas = drawImageBitmapToCacheCanvas(bitmap, 1000, createCanvas);

    expect(createCanvas).toHaveBeenCalledWith(1000, 500);
    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(500);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1000, 500);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('still closes the bitmap when no 2D context is available', () => {
    const bitmap = buildImageBitmap({ width: 100, height: 100, close: vi.fn() });
    const getContext = vi.fn(() => null);
    const createCanvas = vi.fn((width: number, height: number): ImageCacheCanvas =>
      buildImageCacheCanvas({ width, height, getContext })
    );

    const canvas = drawImageBitmapToCacheCanvas(bitmap, 1000, createCanvas);

    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(100);
    expect(getContext).toHaveBeenCalledWith('2d');
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('uses OffscreenCanvas when the browser exposes it', () => {
    class FakeOffscreenCanvas {
      readonly width: number;
      readonly height: number;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }

      getContext(): null {
        return null;
      }
    }

    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    const canvas = createBrowserImageCacheCanvas(320, 240);

    expect(canvas).toBeInstanceOf(FakeOffscreenCanvas);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(240);
  });

  it('uses an HTML canvas fallback when OffscreenCanvas is unavailable', () => {
    vi.stubGlobal('OffscreenCanvas', undefined);

    const canvas = createBrowserImageCacheCanvas(320, 240);

    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(240);
  });
});
