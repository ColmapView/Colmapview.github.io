import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildImage } from '../test/builders';
import { writeImagesBinary } from './colmapBinaryWriters';
import { parseImagesBinary } from './images';
import { renameImagesBinary } from './renameImagesBinary';

beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => vi.unstubAllGlobals());
const source = () => new Map([
  [1, buildImage({ name: 'nested/photo.png', qvec: [0.5, -0.5, 0.5, -0.5], tvec: [1, 2, 3],
    points2D: [{ xy: [12.125, 13.5], point3DId: 9007199254740993n }, { xy: [2, 3], point3DId: -1n }] })],
  [2, buildImage({ imageId: 2, name: 'other.jpg' })],
]);

describe('exported image name replacement', () => {
  it('changes only requested names and preserves IDs, poses and full 64-bit observation records', async () => {
    const images = source(), bytes = new Uint8Array(writeImagesBinary(images)), original = new Uint8Array(bytes);
    const result = await renameImagesBinary(bytes, new Map([[1, 'nested/photo.jpg']])).arrayBuffer();
    expect(parseImagesBinary(result)).toEqual(new Map([[1, { ...images.get(1)!, name: 'nested/photo.jpg', numPoints2D: 2 }],
      [2, { ...images.get(2)!, numPoints2D: images.get(2)!.points2D.length }]]));
    expect(bytes).toEqual(original);
  });
  it('encodes new names as UTF-8 without altering the source buffer', async () => {
    const bytes = new Uint8Array(writeImagesBinary(source()));
    const result = new Uint8Array(await renameImagesBinary(bytes, new Map([[1, 'nested/拍照.jpg']])).arrayBuffer());
    const start = 8 + 64, end = result.indexOf(0, start);
    expect(new TextDecoder().decode(result.subarray(start, end))).toBe('nested/拍照.jpg');
    expect(parseImagesBinary(result.buffer).get(1)!.name).toBe('nested/拍照.jpg');
  });
  it('round-trips Unicode source filenames through the JavaScript writer and reader', () => {
    const images = source(); images.get(1)!.name = 'nested/拍照-é.png';
    const restored = parseImagesBinary(writeImagesBinary(images));
    expect(restored.get(1)!.name).toBe('nested/拍照-é.png');
    expect(restored.get(1)!.points2D).toEqual(images.get(1)!.points2D);
  });
  it('rejects a truncated export and an embedded null instead of producing a corrupt reconstruction', () => {
    const bytes = new Uint8Array(writeImagesBinary(source()));
    expect(() => renameImagesBinary(bytes.subarray(0, bytes.length - 1), new Map())).toThrow('incomplete');
    expect(() => renameImagesBinary(bytes, new Map([[1, 'broken\0.jpg']]))).toThrow('null byte');
  });
});
