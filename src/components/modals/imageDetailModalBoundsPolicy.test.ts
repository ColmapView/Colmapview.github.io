import { describe, expect, it } from 'vitest';
import { buildCamera } from '../../test/builders';
import {
  clampPositionToViewport,
  getInitialImageModalBounds,
  resizeModalBounds,
  type ImageModalSizingOptions,
} from './imageDetailModalBoundsPolicy';

const SIZING_OPTIONS: ImageModalSizingOptions = {
  minWidth: 320,
  minHeight: 240,
  maxWidthPercent: 0.8,
  maxHeightPercent: 0.75,
  headerHeight: 56,
  footerHeight: 48,
  padding: 24,
};

describe('image detail modal bounds policy', () => {
  it('fits initial modal bounds around camera aspect and centers them in the viewport', () => {
    const wideCamera = buildCamera({ width: 1000, height: 500 });
    const tallCamera = buildCamera({ width: 500, height: 1000 });

    expect(getInitialImageModalBounds(wideCamera, { width: 1000, height: 800 }, SIZING_OPTIONS)).toEqual({
      size: { width: 800, height: 516 },
      position: { x: 100, y: 142 },
    });
    expect(getInitialImageModalBounds(tallCamera, { width: 1000, height: 800 }, SIZING_OPTIONS)).toEqual({
      size: { width: 320, height: 600 },
      position: { x: 340, y: 100 },
    });
  });

  it('respects minimum modal bounds when the viewport is small', () => {
    const camera = buildCamera({ width: 400, height: 300 });

    expect(getInitialImageModalBounds(camera, { width: 320, height: 240 }, SIZING_OPTIONS)).toEqual({
      size: { width: 320, height: 240 },
      position: { x: 0, y: 0 },
    });
  });

  it('resizes east and south edges without moving the origin', () => {
    expect(resizeModalBounds({
      startPointer: { x: 100, y: 100 },
      currentPointer: { x: 150, y: 170 },
      startSize: { width: 400, height: 300 },
      startPosition: { x: 20, y: 30 },
      direction: 'se',
      minWidth: 320,
      minHeight: 240,
    })).toEqual({
      size: { width: 450, height: 370 },
      position: { x: 20, y: 30 },
    });
  });

  it('resizes west and north edges while preserving minimum bounds', () => {
    expect(resizeModalBounds({
      startPointer: { x: 100, y: 100 },
      currentPointer: { x: 60, y: 80 },
      startSize: { width: 400, height: 300 },
      startPosition: { x: 20, y: 30 },
      direction: 'nw',
      minWidth: 320,
      minHeight: 240,
    })).toEqual({
      size: { width: 440, height: 320 },
      position: { x: -20, y: 10 },
    });

    expect(resizeModalBounds({
      startPointer: { x: 100, y: 100 },
      currentPointer: { x: 200, y: 200 },
      startSize: { width: 350, height: 260 },
      startPosition: { x: 20, y: 30 },
      direction: 'nw',
      minWidth: 320,
      minHeight: 240,
    })).toEqual({
      size: { width: 350, height: 260 },
      position: { x: 20, y: 30 },
    });
  });

  it('clamps modal position into the visible viewport', () => {
    expect(clampPositionToViewport(
      { x: -20, y: 500 },
      { width: 300, height: 200 },
      { width: 800, height: 600 }
    )).toEqual({ x: 0, y: 400 });
  });
});
