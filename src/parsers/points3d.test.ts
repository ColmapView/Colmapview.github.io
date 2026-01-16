import { describe, it, expect } from 'vitest';
import { parsePoints3DText } from './points3d';

describe('parsePoints3DText', () => {
  it('returns empty map for empty input', () => {
    const result = parsePoints3DText('');
    expect(result.size).toBe(0);
  });

  it('skips comment lines', () => {
    const input = `# 3D point list with one line of data per point:
#   POINT3D_ID, X, Y, Z, R, G, B, ERROR, TRACK[] as (IMAGE_ID, POINT2D_IDX)
# Number of points: 0`;
    const result = parsePoints3DText(input);
    expect(result.size).toBe(0);
  });

  it('parses single point with track', () => {
    const input = '63390 1.67241 0.292931 0.609726 115 121 122 1.33927 16 6542 15 7345';
    const result = parsePoints3DText(input);

    expect(result.size).toBe(1);
    const point = result.get(63390n);
    expect(point).toBeDefined();
    expect(point!.point3DId).toBe(63390n);
    expect(point!.xyz[0]).toBeCloseTo(1.67241);
    expect(point!.xyz[1]).toBeCloseTo(0.292931);
    expect(point!.xyz[2]).toBeCloseTo(0.609726);
    expect(point!.rgb).toEqual([115, 121, 122]);
    expect(point!.error).toBeCloseTo(1.33927);
    expect(point!.track).toHaveLength(2);
    expect(point!.track[0]).toEqual({ imageId: 16, point2DIdx: 6542 });
    expect(point!.track[1]).toEqual({ imageId: 15, point2DIdx: 7345 });
  });

  it('parses point with no track', () => {
    const input = '12345 1.0 2.0 3.0 255 0 128 0.5';
    const result = parsePoints3DText(input);

    const point = result.get(12345n);
    expect(point).toBeDefined();
    expect(point!.track).toHaveLength(0);
  });

  it('parses multiple points', () => {
    const input = `63390 1.67241 0.292931 0.609726 115 121 122 1.33927 16 6542
63391 2.0 3.0 4.0 200 100 50 0.8 1 100 2 200 3 300`;
    const result = parsePoints3DText(input);

    expect(result.size).toBe(2);
    expect(result.has(63390n)).toBe(true);
    expect(result.has(63391n)).toBe(true);
    expect(result.get(63391n)!.track).toHaveLength(3);
  });

  it('handles large point3D_id (BigInt)', () => {
    const input = '9007199254740993 1.0 2.0 3.0 255 255 255 0.1 1 1';
    const result = parsePoints3DText(input);

    // 9007199254740993 is > Number.MAX_SAFE_INTEGER
    expect(result.has(9007199254740993n)).toBe(true);
  });

  it('handles negative coordinates', () => {
    const input = '1 -1.5 -2.5 -3.5 100 100 100 0.1';
    const result = parsePoints3DText(input);

    const point = result.get(1n);
    expect(point!.xyz).toEqual([-1.5, -2.5, -3.5]);
  });

  it('handles RGB values at boundaries', () => {
    const input1 = '1 0 0 0 0 0 0 0.0';
    const input2 = '2 0 0 0 255 255 255 0.0';

    const result1 = parsePoints3DText(input1);
    const result2 = parsePoints3DText(input2);

    expect(result1.get(1n)!.rgb).toEqual([0, 0, 0]);
    expect(result2.get(2n)!.rgb).toEqual([255, 255, 255]);
  });

  it('handles zero error', () => {
    const input = '1 0 0 0 128 128 128 0.0';
    const result = parsePoints3DText(input);

    expect(result.get(1n)!.error).toBe(0);
  });

  it('handles mixed comments and data', () => {
    const input = `# Header
1 1.0 2.0 3.0 100 100 100 0.5 1 1
# Comment in middle
2 4.0 5.0 6.0 200 200 200 0.6 2 2

3 7.0 8.0 9.0 50 50 50 0.7`;
    const result = parsePoints3DText(input);

    expect(result.size).toBe(3);
  });

  it('skips lines with too few parts', () => {
    const input = '1 2.0 3.0';
    const result = parsePoints3DText(input);
    expect(result.size).toBe(0);
  });

  it('handles very small error values', () => {
    const input = '1 0 0 0 128 128 128 0.000001';
    const result = parsePoints3DText(input);

    expect(result.get(1n)!.error).toBeCloseTo(0.000001, 8);
  });
});
