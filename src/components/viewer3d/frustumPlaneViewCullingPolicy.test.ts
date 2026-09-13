import { describe, expect, it } from 'vitest';
import {
  FRUSTUM_PLANE_CULL_INTERVAL_MS,
  getFrustumPlaneCullDelay,
  getFrustumPlaneViewAngleOk,
  shouldUpdateFrustumPlaneViewAngle,
} from './frustumPlaneViewCullingPolicy';

describe('frustum plane view culling policy', () => {
  it('measures the initial pose immediately and gives dirty poses a wall-time deadline', () => {
    expect(getFrustumPlaneCullDelay(1, null)).toBe(0);
    expect(getFrustumPlaneCullDelay(20, 10)).toBe(FRUSTUM_PLANE_CULL_INTERVAL_MS - 10);
    expect(getFrustumPlaneCullDelay(90, 10)).toBe(0);
    expect(getFrustumPlaneCullDelay(9000, 10)).toBe(0);
  });

  it('keeps selected and close planes visible', () => {
    expect(getFrustumPlaneViewAngleOk({
      isSelected: true,
      distanceToCamera: 100,
      closeDistance: 3,
      dotProduct: 0,
      cullAngleThreshold: 0.5,
    })).toBe(true);

    expect(getFrustumPlaneViewAngleOk({
      isSelected: false,
      distanceToCamera: 2.99,
      closeDistance: 3,
      dotProduct: 0,
      cullAngleThreshold: 0.5,
    })).toBe(true);
  });

  it('uses the cull threshold for non-selected distant planes', () => {
    expect(getFrustumPlaneViewAngleOk({
      isSelected: false,
      distanceToCamera: 4,
      closeDistance: 3,
      dotProduct: 0.5,
      cullAngleThreshold: 0.5,
    })).toBe(true);

    expect(getFrustumPlaneViewAngleOk({
      isSelected: false,
      distanceToCamera: 4,
      closeDistance: 3,
      dotProduct: 0.49,
      cullAngleThreshold: 0.5,
    })).toBe(false);
  });

  it('updates state only when visibility changes', () => {
    expect(shouldUpdateFrustumPlaneViewAngle({ current: true, next: false })).toBe(true);
    expect(shouldUpdateFrustumPlaneViewAngle({ current: true, next: true })).toBe(false);
  });
});
