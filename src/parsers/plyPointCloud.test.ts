import { describe, expect, it } from 'vitest';
import {
  classifyPlyFile,
  classifyPlyHeaderText,
  getPlyHeaderVertexCount,
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
  it.each(['ascii', 'binary_little_endian', 'binary_big_endian'])(
    'skips variable visibility lists while preserving XYZ/RGB and untracked IDs (%s)', async format => {
      const header = ['ply', `format ${format} 1.0`, 'element vertex 2', 'property list uint8 uint32 view_indices',
        'property float32 x', 'property float32 y', 'property float32 z',
        'property uint8 red', 'property uint8 green', 'property uint8 blue',
        'property list uint8 float32 view_weights', 'end_header', ''].join('\n');
      let data: string | ArrayBuffer;
      if (format === 'ascii') data = '2 7 9 1 2 3 1 0 255 2 .2 .3\n0 -1 -2 -3 10 20 30 1 .7\n';
      else {
        data = new ArrayBuffer(2 + 8 + 30 + 2 + 12);
        const view = new DataView(data), little = format === 'binary_little_endian';
        let offset = 0;
        for (const [indices, xyz, rgb, weights] of [
          [[7, 9], [1, 2, 3], [1, 0, 255], [.2, .3]],
          [[], [-1, -2, -3], [10, 20, 30], [.7]],
        ]) {
          view.setUint8(offset++, indices.length);
          for (const value of indices) { view.setUint32(offset, value, little); offset += 4; }
          for (const value of xyz) { view.setFloat32(offset, value, little); offset += 4; }
          for (const value of rgb) view.setUint8(offset++, value);
          view.setUint8(offset++, weights.length);
          for (const value of weights) { view.setFloat32(offset, value, little); offset += 4; }
        }
      }
      const points = await parsePointCloudPlyFile(new File([header, data], 'frame.ply'));
      expect([...points.keys()]).toEqual([1n, 2n]);
      expect(points.get(1n)).toMatchObject({ xyz: [1, 2, 3], rgb: [1, 0, 255], track: [] });
      expect(points.get(2n)).toMatchObject({ xyz: [-1, -2, -3], rgb: [10, 20, 30], track: [] });
    }
  );

  it.each(['-1', '4294967295', '2 1'])( 'rejects truncated or invalid ASCII lists (%s)', async list => {
    const body = 'ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nproperty list uint32 uint32 views\nend_header\n1 2 3 ' + list;
    await expect(parsePointCloudPlyFile(new File([body], 'frame.ply'))).rejects.toThrow(/list/i);
  });

  it('rejects a binary list length before allocating or reading its missing elements', async () => {
    const header = 'ply\nformat binary_little_endian 1.0\nelement vertex 1\nproperty list uint32 uint32 views\nproperty float x\nproperty float y\nproperty float z\nend_header\n';
    const data = new ArrayBuffer(4); new DataView(data).setUint32(0, 0xffffffff, true);
    await expect(parsePointCloudPlyFile(new File([header, data], 'frame.ply'))).rejects.toThrow(/list/i);
    await expect(parsePointCloudPlyFile(new File([header.replace('uint32 uint32 views', 'float uint32 views'), data], 'frame.ply'))).rejects.toThrow(/integer/i);
  });
  it.each(['ascii', 'binary_little_endian', 'binary_big_endian'])(
    'preserves dark byte colors while still decoding normalized float colors (%s)', async format => {
      for (const colorType of ['uchar', 'float']) {
        const rgb = colorType === 'uchar' ? [1, 0, 255] : [1, 0.5, 0];
        const header = ['ply', `format ${format} 1.0`, 'element vertex 1',
          ...['x', 'y', 'z'].map(name => `property float ${name}`),
          ...['red', 'green', 'blue'].map(name => `property ${colorType} ${name}`), 'end_header', ''].join('\n');
        let data: string | ArrayBuffer;
        if (format === 'ascii') data = [1, 2, 3, ...rgb].join(' ') + '\n';
        else {
          data = new ArrayBuffer(colorType === 'uchar' ? 15 : 24);
          const view = new DataView(data), little = format === 'binary_little_endian';
          [1, 2, 3].forEach((value, index) => view.setFloat32(index * 4, value, little));
          rgb.forEach((value, index) => colorType === 'uchar' ? view.setUint8(12 + index, value) : view.setFloat32(12 + index * 4, value, little));
        }
        const points = await parsePointCloudPlyFile(new File([header, data], 'points.ply'));
        expect(points.get(1n)?.rgb).toEqual(colorType === 'uchar' ? [1, 0, 255] : [255, 128, 0]);
        expect(points.get(1n)?.xyz).toEqual([1, 2, 3]);
      }
    }
  );

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

describe('getPlyHeaderVertexCount', () => {
  const header = [
    'ply',
    'format binary_little_endian 1.0',
    'element vertex 10000000',
    'property float x',
    'property float y',
    'property float z',
    'end_header',
    '',
  ].join('\n');

  it('reads the vertex element count from a PLY header', () => {
    expect(getPlyHeaderVertexCount(header)).toBe(10_000_000);
  });

  it('returns null for non-PLY text and headers without a vertex element', () => {
    expect(getPlyHeaderVertexCount('not a ply')).toBeNull();
    expect(getPlyHeaderVertexCount('ply\nformat ascii 1.0\nelement face 3\nend_header\n')).toBeNull();
  });
});
