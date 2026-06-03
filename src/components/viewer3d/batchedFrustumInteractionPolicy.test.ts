import { describe, expect, it } from 'vitest';
import {
  getBatchedFrustum,
  getBatchedFrustumTouchUpAction,
  getInteractiveBatchedFrustum,
  getSquaredBatchedFrustumPointerTravel,
} from './batchedFrustumInteractionPolicy';

const frustums = [
  { image: { imageId: 1 } },
  { image: { imageId: 2 } },
];

describe('batched frustum interaction policy', () => {
  it('looks up frustums by instance id and ignores missing targets', () => {
    expect(getBatchedFrustum(frustums, 1)).toBe(frustums[1]);
    expect(getBatchedFrustum(frustums, undefined)).toBeUndefined();
    expect(getBatchedFrustum(frustums, 99)).toBeUndefined();
  });

  it('filters selected frustums out of interactive targets', () => {
    expect(getInteractiveBatchedFrustum({
      frustums,
      instanceId: 0,
      selectedImageId: null,
    })).toBe(frustums[0]);

    expect(getInteractiveBatchedFrustum({
      frustums,
      instanceId: 0,
      selectedImageId: 1,
    })).toBeUndefined();
  });

  it('measures squared pointer travel for tap threshold checks', () => {
    expect(getSquaredBatchedFrustumPointerTravel(
      { x: 10, y: 5 },
      { x: 13, y: 9 }
    )).toBe(25);
  });

  it('plans touch-up context menus only for short active taps', () => {
    expect(getBatchedFrustumTouchUpAction({
      frustums,
      touchStart: null,
      touchEnd: { x: 0, y: 0 },
      selectedImageId: null,
    })).toEqual({ type: 'none' });

    expect(getBatchedFrustumTouchUpAction({
      frustums,
      touchStart: { instanceId: 1, x: 0, y: 0, fired: true },
      touchEnd: { x: 0, y: 0 },
      selectedImageId: null,
    })).toEqual({ type: 'none' });

    expect(getBatchedFrustumTouchUpAction({
      frustums,
      touchStart: { instanceId: 1, x: 0, y: 0, fired: false },
      touchEnd: { x: 16, y: 0 },
      selectedImageId: null,
    })).toEqual({ type: 'none' });

    expect(getBatchedFrustumTouchUpAction({
      frustums,
      touchStart: { instanceId: 1, x: 0, y: 0, fired: false },
      touchEnd: { x: 1, y: 1 },
      selectedImageId: 2,
    })).toEqual({ type: 'none' });

    expect(getBatchedFrustumTouchUpAction({
      frustums,
      touchStart: { instanceId: 1, x: 20, y: 20, fired: false },
      touchEnd: { x: 22, y: 22 },
      selectedImageId: null,
    })).toEqual({ type: 'openContextMenu', frustum: frustums[1], instanceId: 1 });
  });
});
