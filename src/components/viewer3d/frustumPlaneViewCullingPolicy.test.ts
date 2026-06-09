import { describe, expect, it } from 'vitest';
import {
  FRUSTUM_PLANE_CULL_CHECK_INTERVAL,
  getInitialFrustumPlaneCullFrame,
  getFrustumPlaneViewAngleOk,
  getNextFrustumPlaneCullFrame,
  shouldMeasureFrustumPlaneViewAngle,
  shouldUpdateFrustumPlaneViewAngle,
} from './frustumPlaneViewCullingPolicy';

describe('frustum plane view culling policy', () => {
  it('stagger-initializes culling frames from a stable seed', () => {
    expect(getInitialFrustumPlaneCullFrame({
      seed: 12,
      interval: FRUSTUM_PLANE_CULL_CHECK_INTERVAL,
    })).toBe(2);
    expect(getInitialFrustumPlaneCullFrame({
      seed: -12,
      interval: FRUSTUM_PLANE_CULL_CHECK_INTERVAL,
    })).toBe(2);
    expect(getInitialFrustumPlaneCullFrame({
      seed: Number.NaN,
      interval: FRUSTUM_PLANE_CULL_CHECK_INTERVAL,
    })).toBe(0);
  });

  it('advances culling frames and wraps at the configured interval', () => {
    expect(getNextFrustumPlaneCullFrame({
      frameCount: 0,
      interval: FRUSTUM_PLANE_CULL_CHECK_INTERVAL,
    })).toBe(1);
    expect(getNextFrustumPlaneCullFrame({
      frameCount: 4,
      interval: FRUSTUM_PLANE_CULL_CHECK_INTERVAL,
    })).toBe(0);
  });

  it('measures view angle only on wrapped culling frames', () => {
    expect(shouldMeasureFrustumPlaneViewAngle(0)).toBe(true);
    expect(shouldMeasureFrustumPlaneViewAngle(1)).toBe(false);
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
