import { describe, expect, it } from 'vitest';
import type { Plane } from '../../utils/ransac';
import {
  getFloorPlaneWidgetData,
  getScreenPoint,
  shouldClaimFloorPlaneContextPointer,
  shouldOpenFloorModalOnHover,
} from './floorPlaneWidgetViewModel';

const plane: Plane = {
  normal: [0, 0, 1],
  d: -3,
  centroid: [1, 2, 3],
  inlierCount: 12,
  radius: 10,
};

function expectVectorClose(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index]);
  });
}

describe('floor plane widget view model', () => {
  it('returns null when no plane has been detected', () => {
    expect(getFloorPlaneWidgetData({
      boundsRadius: 20,
      detectedPlane: null,
      normalFlipped: false,
      axesScale: 0.5,
    })).toBeNull();
  });

  it('derives stable arrow and label geometry from the detected plane', () => {
    const data = getFloorPlaneWidgetData({
      boundsRadius: 20,
      detectedPlane: plane,
      normalFlipped: false,
      axesScale: 0.5,
    });

    expect(data).not.toBeNull();
    expectVectorClose(data!.position.toArray(), [1, 2, 3]);
    expectVectorClose(data!.normalVec.toArray(), [0, 0, 1]);
    expect(data!.radius).toBe(10);
    expect(data!.arrowRadius).toBeCloseTo(0.05);
    expect(data!.coneHeight).toBeCloseTo(0.4);
    expect(data!.coneRadius).toBeCloseTo(0.15);
    expect(data!.shaftLength).toBeCloseTo(4.6);
    expectVectorClose(data!.shaftCenter.toArray(), [1, 2, 5.3]);
    expectVectorClose(data!.conePosition.toArray(), [1, 2, 7.8]);
    expectVectorClose(data!.labelPosition.toArray(), [1, 2, 8.75]);
    expect(data!.fontSize).toBeCloseTo(0.8);
  });

  it('flips derived direction when the normal is flipped', () => {
    const data = getFloorPlaneWidgetData({
      boundsRadius: 20,
      detectedPlane: plane,
      normalFlipped: true,
      axesScale: 0.5,
    });

    expect(data).not.toBeNull();
    expectVectorClose(data!.normalVec.toArray(), [0, 0, -1]);
    expectVectorClose(data!.shaftCenter.toArray(), [1, 2, 0.7]);
    expectVectorClose(data!.conePosition.toArray(), [1, 2, -1.8]);
    expectVectorClose(data!.labelPosition.toArray(), [1, 2, -2.75]);
  });

  it('claims only right-click pointer events for the widget context action', () => {
    expect(shouldClaimFloorPlaneContextPointer(2)).toBe(true);
    expect(shouldClaimFloorPlaneContextPointer(0)).toBe(false);
    expect(shouldClaimFloorPlaneContextPointer(1)).toBe(false);
  });

  it('opens the floor modal only when hover starts while closed', () => {
    expect(shouldOpenFloorModalOnHover(false)).toBe(true);
    expect(shouldOpenFloorModalOnHover(true)).toBe(false);
  });

  it('normalizes client coordinates into screen points', () => {
    expect(getScreenPoint(12, 34)).toEqual({ x: 12, y: 34 });
  });
});
