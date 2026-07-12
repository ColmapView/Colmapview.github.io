import { describe, expect, it } from 'vitest';
import {
  AXIS_SEMANTIC,
  COORDINATE_SYSTEMS,
  getCoordinateSystemAxisDirection,
  getWorldUp,
  isAxisSemanticallyDown,
  type CoordinateSystemAxis,
} from './coordinateSystems';

describe('coordinate systems', () => {
  it('maps typed display axes to coordinate-system direction keys', () => {
    expect(getCoordinateSystemAxisDirection('threejs', 'X')).toEqual([1, 0, 0]);
    expect(getCoordinateSystemAxisDirection('blender', 'Z')).toEqual([0, 1, 0]);
    expect(getCoordinateSystemAxisDirection('unreal', 'X')).toEqual([0, 0, -1]);
  });

  it('keeps semantic labels defined for every typed axis', () => {
    const axes: CoordinateSystemAxis[] = ['X', 'Y', 'Z'];

    for (const coordinateSystem of Object.keys(COORDINATE_SYSTEMS) as Array<keyof typeof COORDINATE_SYSTEMS>) {
      expect(axes.map((axis) => AXIS_SEMANTIC[coordinateSystem][axis])).toHaveLength(3);
    }
  });

  it('derives world up from Y-up and Z-up coordinate systems', () => {
    expect(getWorldUp('threejs')).toEqual([0, 1, 0]);
    expect(getWorldUp('blender')).toEqual([0, 1, 0]);
    expect(getWorldUp('unreal')).toEqual([0, 1, 0]);
  });

  it('negates world up for Y-DOWN conventions (COLMAP/OpenCV)', () => {
    // AXIS_SEMANTIC pins Y: 'Down' for these systems — treating +Y as world up
    // inverted horizon lock and made floor alignment map cameras onto the
    // convention's down axis.
    expect(getWorldUp('colmap')).toEqual([0, -1, 0]);
    expect(getWorldUp('opencv')).toEqual([0, -1, 0]);
  });

  it('reports which display axes are semantically down', () => {
    expect(isAxisSemanticallyDown('colmap', 'Y')).toBe(true);
    expect(isAxisSemanticallyDown('opencv', 'Y')).toBe(true);
    expect(isAxisSemanticallyDown('colmap', 'Z')).toBe(false); // Fwd
    expect(isAxisSemanticallyDown('colmap', 'X')).toBe(false); // Right
    expect(isAxisSemanticallyDown('threejs', 'Y')).toBe(false); // Up
    expect(isAxisSemanticallyDown('blender', 'Z')).toBe(false); // Up
  });
});
