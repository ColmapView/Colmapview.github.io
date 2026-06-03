import { describe, expect, it } from 'vitest';
import {
  calculateFixedHtmlPosition,
  getFixedContextMenuHtmlStyle,
  getFixedCursorHtmlStyle,
  getPointerEnabledHtmlStyle,
} from './htmlOverlayStylePolicy';

describe('html overlay style policy', () => {
  it('pins Drei Html overlays to screen coordinates', () => {
    expect(calculateFixedHtmlPosition()).toEqual([0, 0]);
  });

  it('builds cursor-following tooltip styles with an offset', () => {
    expect(getFixedCursorHtmlStyle({ x: 100, y: 200 }, 12)).toEqual({
      position: 'fixed',
      left: 112,
      top: 212,
      pointerEvents: 'none',
      transform: 'none',
    });
  });

  it('builds pointer-enabled context menu styles without an offset', () => {
    expect(getFixedContextMenuHtmlStyle({ x: 30, y: 40 })).toEqual({
      position: 'fixed',
      left: 30,
      top: 40,
      pointerEvents: 'auto',
    });
  });

  it('builds pointer-enabled world-anchored Html overlay styles', () => {
    expect(getPointerEnabledHtmlStyle()).toEqual({
      pointerEvents: 'auto',
    });
  });
});
