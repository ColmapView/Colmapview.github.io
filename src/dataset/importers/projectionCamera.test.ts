import { describe, expect, it } from 'vitest';
import { Euler, Matrix4 } from 'three';
import { decomposePinholeProjection } from './projectionCamera';

describe('camera projection decomposition', () => {
  it.each([1, -2, 1e-120, -1e120])('preserves calibration and translation at projective scale %s', scale => {
    const p = [20, 0, 4, 52, 0, 22, 3, -35, 0, 0, 1, 3].map(value => value * scale);
    const { params, pose } = decomposePinholeProjection(p);
    params.forEach((value, index) => expect(value).toBeCloseTo([20, 22, 4, 3][index], 12));
    pose.tvec.forEach((value, index) => expect(value).toBeCloseTo([2, -2, 3][index], 12));
    expect(pose.qvec[0]).toBeCloseTo(1, 12);
  });
  it('recovers independently composed rotated pinhole cameras', () => {
    const matrix = new Matrix4().makeRotationFromEuler(new Euler(.7, -.8, 1.3)), e = matrix.elements;
    const r = [[e[0], e[4], e[8]], [e[1], e[5], e[9]], [e[2], e[6], e[10]]], t = [1, 2, -3];
    const k = [[700, 0, 302], [0, 710, 207], [0, 0, 1]];
    const p = k.flatMap(row => [0, 1, 2, 3].map(column => row.reduce((sum, value, axis) => sum + value * (column === 3 ? t[axis] : r[axis][column]), 0)));
    const output = decomposePinholeProjection(p);
    output.params.forEach((value, index) => expect(value).toBeCloseTo([700, 710, 302, 207][index], 9));
    output.pose.tvec.forEach((value, index) => expect(value).toBeCloseTo(t[index], 10));
  });
  it('rejects skew, singular calibration and nonfinite projections', () => {
    expect(() => decomposePinholeProjection([20, 2, 4, 0, 0, 22, 3, 0, 0, 0, 1, 0])).toThrow(/skew/);
    expect(() => decomposePinholeProjection(new Array(12).fill(0))).toThrow();
    expect(() => decomposePinholeProjection(new Array(12).fill(Infinity))).toThrow(/finite/);
  });
  it('accepts only an explicitly supplied source-precision tolerance for tiny skew', () => {
    const projection = [3000, .0005, 800, 0, 0, 2990, 600, 0, 0, 0, 1, 0];
    expect(() => decomposePinholeProjection(projection)).toThrow(/skew/);
    expect(decomposePinholeProjection(projection, 8 * 2 ** -23).skew).toBeCloseTo(.0005, 12);
    projection[1] = .1;
    expect(() => decomposePinholeProjection(projection, 8 * 2 ** -23)).toThrow(/skew/);
  });
});
