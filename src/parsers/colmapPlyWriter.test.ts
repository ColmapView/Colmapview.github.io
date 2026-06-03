import { describe, expect, it } from 'vitest';
import { buildPoint3D } from '../test/builders';
import { writePointsPLY } from './colmapPlyWriter';

describe('writePointsPLY', () => {
  it('writes an ASCII PLY header and point rows', () => {
    const points3D = new Map([
      [2n, buildPoint3D({
        point3DId: 2n,
        xyz: [1.25, -2.5, 3.75],
        rgb: [10, 20, 30],
      })],
      [1n, buildPoint3D({
        point3DId: 1n,
        xyz: [4, 5, 6],
        rgb: [255, 128, 0],
      })],
    ]);

    expect(writePointsPLY(points3D)).toBe([
      'ply',
      'format ascii 1.0',
      'element vertex 2',
      'property float x',
      'property float y',
      'property float z',
      'property uchar red',
      'property uchar green',
      'property uchar blue',
      'end_header',
      '1.25 -2.5 3.75 10 20 30',
      '4 5 6 255 128 0',
      '',
    ].join('\n'));
  });

  it('preserves map iteration order for point rows', () => {
    const points3D = new Map([
      [3n, buildPoint3D({ point3DId: 3n, xyz: [3, 0, 0], rgb: [3, 3, 3] })],
      [1n, buildPoint3D({ point3DId: 1n, xyz: [1, 0, 0], rgb: [1, 1, 1] })],
      [2n, buildPoint3D({ point3DId: 2n, xyz: [2, 0, 0], rgb: [2, 2, 2] })],
    ]);

    const rows = writePointsPLY(points3D).split('\n').slice(10, 13);

    expect(rows).toEqual([
      '3 0 0 3 3 3',
      '1 0 0 1 1 1',
      '2 0 0 2 2 2',
    ]);
  });

  it('writes a valid empty point cloud', () => {
    expect(writePointsPLY(new Map())).toBe([
      'ply',
      'format ascii 1.0',
      'element vertex 0',
      'property float x',
      'property float y',
      'property float z',
      'property uchar red',
      'property uchar green',
      'property uchar blue',
      'end_header',
      '',
      '',
    ].join('\n'));
  });
});
