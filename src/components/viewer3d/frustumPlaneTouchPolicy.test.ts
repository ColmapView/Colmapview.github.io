import { describe, expect, it } from 'vitest';
import {
  getFrustumPlaneTouchUpAction,
  getSquaredTouchTravel,
} from './frustumPlaneTouchPolicy';

describe('frustum plane touch policy', () => {
  it('measures squared touch travel without a square-root cost', () => {
    expect(getSquaredTouchTravel({ x: 10, y: 5 }, { x: 13, y: 9 })).toBe(25);
  });

  it('ignores missing, already-fired, and moved touch starts', () => {
    expect(getFrustumPlaneTouchUpAction({
      touchStart: null,
      touchEnd: { x: 0, y: 0 },
      isSelected: false,
    })).toBe('none');

    expect(getFrustumPlaneTouchUpAction({
      touchStart: { x: 0, y: 0, fired: true },
      touchEnd: { x: 1, y: 1 },
      isSelected: false,
    })).toBe('none');

    expect(getFrustumPlaneTouchUpAction({
      touchStart: { x: 0, y: 0, fired: false },
      touchEnd: { x: 16, y: 0 },
      isSelected: false,
    })).toBe('none');
  });

  it('toggles selected plane transparency for short selected taps', () => {
    expect(getFrustumPlaneTouchUpAction({
      touchStart: { x: 10, y: 10, fired: false },
      touchEnd: { x: 20, y: 20 },
      isSelected: true,
    })).toBe('toggleSelectedTransparency');
  });

  it('opens the context menu for short non-selected taps', () => {
    expect(getFrustumPlaneTouchUpAction({
      touchStart: { x: 10, y: 10, fired: false },
      touchEnd: { x: 20, y: 20 },
      isSelected: false,
    })).toBe('openContextMenu');
  });
});
