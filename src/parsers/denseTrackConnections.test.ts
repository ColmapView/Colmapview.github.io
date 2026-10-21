import { describe, expect, it, vi } from 'vitest';
import { denseTrackConnections } from './denseTrackConnections';
import { computeImageStats, computeImageStatsFromWasm } from './imageStats';
import type { Image, Point3D } from '../types/colmap';
import type { WasmReconstructionWrapper } from '../wasm/reconstruction';

function fixture(registered = 128, duplicate = false) {
  const count = 300, offsets = [0], tracks: number[] = [];
  const images = new Map<number, Image>();
  for (let index = 0; index < registered; index++) {
    const id = index * 3 + 7;
    images.set(id, { imageId: id, cameraId: 1, name: `${id}.png`, qvec: [1, 0, 0, 0], tvec: [0, 0, 0], points2D: [] });
  }
  const points = new Map<bigint, Point3D>(), errors = new Float32Array(count);
  for (let point = 0; point < count; point++) {
    const ids: number[] = [];
    if (point % 9) for (let item = 0; item < 96 + point % 33; item++) ids.push(((point * 17 + item) % 128) * 3 + 7);
    if (duplicate && point === 1) ids[1] = ids[0];
    tracks.push(...ids); offsets.push(tracks.length);
    const id = 2n ** 53n + BigInt(point), error = point % 3 ? 0.5 : -1;
    errors[point] = error;
    points.set(id, { point3DId: id, xyz: [0, 0, 0], rgb: [1, 2, 3], error, track: ids.map(imageId => ({ imageId, point2DIdx: 0 })) });
  }
  const readIds = vi.fn(() => { throw new Error('Membership opt-out must not read point IDs'); });
  const source = { pointCount: count, getErrors: () => errors, getTrackOffsets: () => Uint32Array.from(offsets),
    getTrackImageIds: () => Uint32Array.from(tracks), getPoint3DIds: readIds } as unknown as WasmReconstructionWrapper;
  return { images, points, source, readIds, offsets: Uint32Array.from(offsets), tracks: Uint32Array.from(tracks) };
}

describe('dense track connection counts', () => {
  for (const registered of [100, 128]) it(`preserves all statistics with ${registered} registered images and nonuniform tracks`, () => {
    const data = fixture(registered);
    const graph = denseTrackConnections(data.images.keys(), data.points.size, data.offsets, data.tracks);
    expect(graph).not.toBeNull();
    const expected = computeImageStats(data.images, data.points);
    const actual = computeImageStatsFromWasm(data.images, data.source, { includePointMembership: false });
    expect(actual.globalStats).toEqual(expected.globalStats);
    expect(actual.imageStats).toEqual(expected.imageStats);
    expect(actual.connectedImagesIndex).toEqual(expected.connectedImagesIndex);
    expect(actual.imageToPoint3DIds.size).toBe(0);
    expect(data.readIds).not.toHaveBeenCalled();
  });

  it('keeps duplicate-reference behavior through the existing fallback', () => {
    const data = fixture(100, true);
    expect(denseTrackConnections(data.images.keys(), data.points.size, data.offsets, data.tracks)).toBeNull();
    const actual = computeImageStatsFromWasm(data.images, data.source, { includePointMembership: false });
    const expected = computeImageStats(data.images, data.points);
    expect(actual.connectedImagesIndex).toEqual(expected.connectedImagesIndex);
    expect(actual.imageStats).toEqual(expected.imageStats);
    expect(actual.globalStats).toEqual(expected.globalStats);
  });

  it('leaves sparse and malformed CSR inputs on the existing path', () => {
    expect(denseTrackConnections([1, 2], 1, new Uint32Array([0, 2]), new Uint32Array([1, 2]))).toBeNull();
    const data = fixture(); data.offsets[0] = 1;
    expect(denseTrackConnections(data.images.keys(), data.points.size, data.offsets, data.tracks)).toBeNull();
  });
});
