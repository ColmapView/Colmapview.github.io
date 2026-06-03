import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCanvas2dContext, buildImageCacheCanvas } from '../test/builders';
import {
  getCanvas2dContext,
  isOffscreenCanvas,
} from './canvasTypeGuards';

describe('canvas type guards', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects OffscreenCanvas only when the browser exposes the constructor', () => {
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

    expect(isOffscreenCanvas(new OffscreenCanvas(10, 20))).toBe(true);
    expect(isOffscreenCanvas(document.createElement('canvas'))).toBe(false);
  });

  it('treats HTML canvases as non-offscreen without reading a missing constructor', () => {
    vi.stubGlobal('OffscreenCanvas', undefined);

    expect(isOffscreenCanvas(document.createElement('canvas'))).toBe(false);
  });

  it('gets 2D contexts from both canvas implementations', () => {
    const htmlContext = buildCanvas2dContext();
    const htmlGetContext = vi.fn(() => htmlContext);
    const htmlCanvas = buildImageCacheCanvas({ getContext: htmlGetContext });

    expect(getCanvas2dContext(htmlCanvas)).toBe(htmlContext);
    expect(htmlGetContext).toHaveBeenCalledWith('2d');

    class FakeOffscreenCanvas {
      readonly width: number;
      readonly height: number;
      readonly getContext = vi.fn(() => null);

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
    }

    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    const offscreenCanvas = new OffscreenCanvas(10, 20);

    expect(getCanvas2dContext(offscreenCanvas)).toBeNull();
  });
});
