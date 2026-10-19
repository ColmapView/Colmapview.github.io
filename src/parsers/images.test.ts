import { describe, it, expect } from 'vitest';
import { parseImagesText } from './images';

describe('parseImagesText', () => {
  it.each([false, true])('preserves consecutive camera-only pose headers (skip points: %s)', skipPoints => {
    // Dynamic Maps exports the next pose immediately after the previous one.
    const input = `# IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME
80 -0.03500771857066321 -0.042140754210753514 -0.6822095072989733 0.7291013678672659 -4791.131202697871 -2629.972891767971 -41428.63775941003 1 26047_Record004_260217_002054031_Camera_1,_+15deg.jpg
81 -0.036416796971811986 -0.04374978484515701 -0.6823605783125221 0.7287961404873908 -4613.896627441842 -2603.481159380001 -41455.01640789224 1 26047_Record004_260217_002054928_Camera_1,_+15deg.jpg
82 1 0 0 0 1 2 3 2 camera two.png`;
    const images = parseImagesText(input, skipPoints);
    expect([...images.keys()]).toEqual([80, 81, 82]);
    expect(images.get(81)?.name).toBe('26047_Record004_260217_002054928_Camera_1,_+15deg.jpg');
    expect(images.get(82)?.name).toBe('camera two.png');
    expect([...images.values()].every(image => image.points2D.length === 0)).toBe(true);
  });

  it('keeps numeric observation rows and mixed omitted/empty observation rows intact', () => {
    const images = parseImagesText(`1 1 0 0 0 0 0 0 1 first.jpg
1 0 0 0 0 0 0 0 1 2 3 4
2 1 0 0 0 0 0 0 1 second.jpg
3 1 0 0 0 0 0 0 1 third.jpg

4 1 0 0 0 0 0 0 1 123
5 6 7`);
    expect([...images.keys()]).toEqual([1, 2, 3, 4]);
    expect(images.get(1)?.points2D).toHaveLength(4);
    expect(images.get(1)?.points2D[3]).toEqual({ xy: [2, 3], point3DId: 4n });
    expect(images.get(2)?.points2D).toEqual([]);
    expect(images.get(3)?.points2D).toEqual([]);
    expect(images.get(4)?.name).toBe('123');
    expect(images.get(4)?.points2D).toEqual([{ xy: [5, 6], point3DId: 7n }]);
  });

  it('returns empty map for empty input', () => {
    const result = parseImagesText('');
    expect(result.size).toBe(0);
  });

  it('skips comment lines', () => {
    const input = `# Image list with two lines of data per image:
#   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME
#   POINTS2D[] as (X, Y, POINT3D_ID)`;
    const result = parseImagesText(input);
    expect(result.size).toBe(0);
  });

  it('parses single image with points', () => {
    const input = `1 0.851773 0.0165051 0.503764 -0.142941 -0.737434 1.02973 3.74354 1 image001.jpg
2362.39 248.498 58396 1784.7 268.254 59027`;
    const result = parseImagesText(input);

    expect(result.size).toBe(1);
    const image = result.get(1);
    expect(image).toBeDefined();
    expect(image!.imageId).toBe(1);
    expect(image!.qvec[0]).toBeCloseTo(0.851773);
    expect(image!.qvec[1]).toBeCloseTo(0.0165051);
    expect(image!.qvec[2]).toBeCloseTo(0.503764);
    expect(image!.qvec[3]).toBeCloseTo(-0.142941);
    expect(image!.tvec[0]).toBeCloseTo(-0.737434);
    expect(image!.tvec[1]).toBeCloseTo(1.02973);
    expect(image!.tvec[2]).toBeCloseTo(3.74354);
    expect(image!.cameraId).toBe(1);
    expect(image!.name).toBe('image001.jpg');
    expect(image!.points2D).toHaveLength(2);
    expect(image!.points2D[0].xy[0]).toBeCloseTo(2362.39);
    expect(image!.points2D[0].point3DId).toBe(58396n);
  });

  it('parses multiple images', () => {
    const input = `1 0.851773 0.0165051 0.503764 -0.142941 -0.737434 1.02973 3.74354 1 image001.jpg
100.0 200.0 123
2 0.9 0.1 0.0 0.0 1.0 2.0 3.0 1 image002.jpg
300.0 400.0 456 500.0 600.0 789`;
    const result = parseImagesText(input);

    expect(result.size).toBe(2);
    expect(result.has(1)).toBe(true);
    expect(result.has(2)).toBe(true);
    expect(result.get(2)!.points2D).toHaveLength(2);
  });

  it('handles image with no points', () => {
    const input = `1 0.851773 0.0165051 0.503764 -0.142941 -0.737434 1.02973 3.74354 1 image001.jpg
`;
    const result = parseImagesText(input);

    expect(result.size).toBe(1);
    const image = result.get(1);
    expect(image!.points2D).toHaveLength(0);
  });

  it('handles negative point3D_id (untriangulated)', () => {
    const input = `1 0.9 0.0 0.0 0.0 0.0 0.0 0.0 1 test.jpg
100.0 200.0 -1`;
    const result = parseImagesText(input);

    const image = result.get(1);
    expect(image!.points2D[0].point3DId).toBe(-1n);
  });

  it('handles mixed comment and data lines', () => {
    const input = `# Header comment
1 0.9 0.0 0.0 0.0 0.0 0.0 0.0 1 test1.jpg
100.0 200.0 123
# Middle comment
2 0.8 0.1 0.0 0.0 1.0 1.0 1.0 2 test2.jpg
300.0 400.0 456`;
    const result = parseImagesText(input);

    expect(result.size).toBe(2);
  });

  it('skips lines with too few parts', () => {
    const input = `1 0.9 0.0`;
    const result = parseImagesText(input);
    expect(result.size).toBe(0);
  });

  it('skips image headers with partial or invalid numeric tokens', () => {
    const input = `1 0.9px 0.0 0.0 0.0 0.0 0.0 0.0 1 bad-qvec.jpg
100.0 200.0 123
2 0.9 0.0 0.0 0.0 0.0 0.0 0.0 1 ok.jpg
100.0 200.0 123`;
    const result = parseImagesText(input);

    expect([...result.keys()]).toEqual([2]);
    expect(result.get(2)?.name).toBe('ok.jpg');
  });

  it('skips malformed point triplets without throwing or storing NaN', () => {
    const input = `1 0.9 0.0 0.0 0.0 0.0 0.0 0.0 1 test.jpg
100.0px 200.0 123 300.0 400.0 bad-id 500.0 600.0 -1`;
    const result = parseImagesText(input);

    expect(result.get(1)?.points2D).toEqual([
      { xy: [500, 600], point3DId: -1n },
    ]);
  });
});
