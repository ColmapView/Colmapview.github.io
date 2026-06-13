import { describe, expect, it } from 'vitest';
import {
  classifyPlyFile,
  classifyPlyHeaderText,
  parsePointCloudPlyFile,
} from './plyPointCloud';

function createGenericBinaryPlyFile(): File {
  const header = [
    'ply',
    'format binary_little_endian 1.0',
    'element vertex 2',
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'end_header',
    '',
  ].join('\n');
  const headerBytes = new TextEncoder().encode(header);
  const rowByteLength = 3 * Float32Array.BYTES_PER_ELEMENT + 3;
  const rows = new ArrayBuffer(rowByteLength * 2);
  const view = new DataView(rows);
  const values = [
    { xyz: [1, 2, 3], rgb: [10, 20, 30] },
    { xyz: [-1, -2, -3], rgb: [200, 210, 220] },
  ];
  values.forEach((value, rowIndex) => {
    const rowOffset = rowIndex * rowByteLength;
    value.xyz.forEach((coordinate, coordinateIndex) => {
      view.setFloat32(rowOffset + coordinateIndex * 4, coordinate, true);
    });
    value.rgb.forEach((channel, channelIndex) => {
      view.setUint8(rowOffset + 12 + channelIndex, channel);
    });
  });

  return new File([headerBytes, rows], 'points.ply');
}

describe('PLY point cloud parser', () => {
  it('classifies ordinary XYZ/RGB PLY files as point clouds', async () => {
    const file = createGenericBinaryPlyFile();

    await expect(classifyPlyFile(file)).resolves.toBe('point-cloud');
  });

  it('classifies SH0 PLY files with complete Gaussian attributes as splats', () => {
    const header = [
      'ply',
      'format binary_little_endian 1.0',
      'element vertex 1',
      'property float x',
      'property float y',
      'property float z',
      'property float f_dc_0',
      'property float f_dc_1',
      'property float f_dc_2',
      'property float opacity',
      'property float scale_0',
      'property float scale_1',
      'property float scale_2',
      'property float rot_0',
      'property float rot_1',
      'property float rot_2',
      'property float rot_3',
      'end_header',
      '',
    ].join('\n');

    expect(classifyPlyHeaderText(header)).toBe('gaussian-splat');
  });

  it('classifies higher-order SH Gaussian PLY files as splats when the core attributes exist', () => {
    const header = [
      'ply',
      'format binary_little_endian 1.0',
      'element vertex 1',
      'property float x',
      'property float y',
      'property float z',
      'property float nx',
      'property float ny',
      'property float nz',
      'property float f_dc_0',
      'property float f_dc_1',
      'property float f_dc_2',
      'property float f_rest_0',
      'property float f_rest_1',
      'property float f_rest_2',
      'property float opacity',
      'property float scale_0',
      'property float scale_1',
      'property float scale_2',
      'property float rot_0',
      'property float rot_1',
      'property float rot_2',
      'property float rot_3',
      'end_header',
      '',
    ].join('\n');

    expect(classifyPlyHeaderText(header)).toBe('gaussian-splat');
  });

  it('does not classify incomplete Gaussian-like PLY files as splats', () => {
    const header = [
      'ply',
      'format binary_little_endian 1.0',
      'element vertex 1',
      'property float x',
      'property float y',
      'property float z',
      'property float f_dc_0',
      'property float f_dc_1',
      'property float f_dc_2',
      'property float opacity',
      'property float scale_0',
      'property float scale_1',
      'property float scale_2',
      'end_header',
      '',
    ].join('\n');

    expect(classifyPlyHeaderText(header)).toBe('point-cloud');
  });

  it('parses binary little-endian XYZ/RGB PLY files into Point3D records', async () => {
    const points = await parsePointCloudPlyFile(createGenericBinaryPlyFile());

    expect(points.size).toBe(2);
    expect(points.get(1n)).toMatchObject({
      point3DId: 1n,
      xyz: [1, 2, 3],
      rgb: [10, 20, 30],
      error: 0,
      track: [],
    });
    expect(points.get(2n)).toMatchObject({
      point3DId: 2n,
      xyz: [-1, -2, -3],
      rgb: [200, 210, 220],
      error: 0,
      track: [],
    });
  });

  it('parses ASCII XYZ/RGB PLY files into Point3D records', async () => {
    const file = new File([[
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
      '1 2 3 10 20 30',
      '-1 -2 -3 200 210 220',
      '',
    ].join('\n')], 'points.ply');

    const points = await parsePointCloudPlyFile(file);

    expect(points.get(1n)?.xyz).toEqual([1, 2, 3]);
    expect(points.get(1n)?.rgb).toEqual([10, 20, 30]);
    expect(points.get(2n)?.xyz).toEqual([-1, -2, -3]);
    expect(points.get(2n)?.rgb).toEqual([200, 210, 220]);
  });
});
