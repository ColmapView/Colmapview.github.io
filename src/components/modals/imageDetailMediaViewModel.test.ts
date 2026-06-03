import { describe, expect, it } from 'vitest';
import {
  getCenteredCanvasOverlayState,
  getSizedCanvasOverlayState,
} from './imageDetailMediaViewModel';

describe('imageDetailMediaViewModel', () => {
  it('centers a canvas over the rendered image area', () => {
    expect(getCenteredCanvasOverlayState({
      imageWidth: 200,
      imageHeight: 100,
      containerWidth: 300,
      containerHeight: 180,
    })).toEqual({
      canRender: true,
      width: 200,
      height: 100,
      style: {
        left: 50,
        top: 40,
      },
    });
  });

  it('marks centered canvases as non-renderable for invalid image dimensions', () => {
    expect(getCenteredCanvasOverlayState({
      imageWidth: 0,
      imageHeight: 100,
      containerWidth: 300,
      containerHeight: 180,
    })).toMatchObject({
      canRender: false,
      width: 0,
      height: 100,
    });
  });

  it('merges caller styles with concrete canvas dimensions', () => {
    expect(getSizedCanvasOverlayState({
      width: 120,
      height: 60,
      style: { position: 'absolute', left: 10, top: 20 },
    })).toEqual({
      canRender: true,
      width: 120,
      height: 60,
      style: {
        position: 'absolute',
        left: 10,
        top: 20,
        width: 120,
        height: 60,
      },
    });
  });

  it('marks sized canvases as non-renderable for invalid dimensions', () => {
    expect(getSizedCanvasOverlayState({
      width: 120,
      height: 0,
      style: { position: 'absolute' },
    })).toMatchObject({
      canRender: false,
      width: 120,
      height: 0,
    });
  });
});
