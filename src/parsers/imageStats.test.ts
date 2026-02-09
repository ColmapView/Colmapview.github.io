import { describe, it, expect } from 'vitest';
import { computeImageStats, computeImageStatsFromWasm } from './imageStats';
import type { Image, Point3D } from '../types/colmap';
import type { WasmReconstructionWrapper } from '../wasm/reconstruction';

// ---------------------------------------------------------------------------
// Helpers to build minimal test data
// ---------------------------------------------------------------------------

function makeImage(imageId: number): Image {
  return {
    imageId,
    qvec: [1, 0, 0, 0],
    tvec: [0, 0, 0],
    cameraId: 1,
    name: `img${imageId}.jpg`,
    points2D: [],
  };
}

function makePoint3D(
  id: bigint,
  error: number,
  track: { imageId: number; point2DIdx: number }[],
): Point3D {
  return {
    point3DId: id,
    xyz: [0, 0, 0],
    rgb: [255, 255, 255],
    error,
    track,
  };
}

function makeImages(...ids: number[]): Map<number, Image> {
  const m = new Map<number, Image>();
  for (const id of ids) m.set(id, makeImage(id));
  return m;
}

// ---------------------------------------------------------------------------
// computeImageStats — JS Map path
// ---------------------------------------------------------------------------

describe('computeImageStats', () => {
  it('returns empty stats when no images and no points', () => {
    const { imageStats, globalStats, connectedImagesIndex, imageToPoint3DIds } =
      computeImageStats(new Map(), new Map());

    expect(imageStats.size).toBe(0);
    expect(connectedImagesIndex.size).toBe(0);
    expect(imageToPoint3DIds.size).toBe(0);
    expect(globalStats.totalPoints).toBe(0);
    expect(globalStats.totalObservations).toBe(0);
    expect(globalStats.avgError).toBe(0);
  });

  it('returns zero-stat entries for images with no observed points', () => {
    const images = makeImages(1, 2);
    const { imageStats, globalStats } = computeImageStats(images, new Map());

    expect(imageStats.size).toBe(2);
    expect(imageStats.get(1)).toEqual({ numPoints3D: 0, avgError: 0, covisibleCount: 0 });
    expect(imageStats.get(2)).toEqual({ numPoints3D: 0, avgError: 0, covisibleCount: 0 });
    expect(globalStats.totalPoints).toBe(0);
  });

  it('computes per-image point count and error for a single point', () => {
    const images = makeImages(1);
    const points3D = new Map<bigint, Point3D>([
      [1n, makePoint3D(1n, 0.5, [{ imageId: 1, point2DIdx: 0 }])],
    ]);

    const { imageStats, globalStats } = computeImageStats(images, points3D);

    expect(imageStats.get(1)!.numPoints3D).toBe(1);
    expect(imageStats.get(1)!.avgError).toBeCloseTo(0.5);
    expect(globalStats.totalPoints).toBe(1);
    expect(globalStats.minError).toBeCloseTo(0.5);
    expect(globalStats.maxError).toBeCloseTo(0.5);
    expect(globalStats.avgError).toBeCloseTo(0.5);
    expect(globalStats.minTrackLength).toBe(1);
    expect(globalStats.maxTrackLength).toBe(1);
    expect(globalStats.totalObservations).toBe(1);
  });

  it('computes covisibility from shared tracks', () => {
    const images = makeImages(1, 2, 3);
    // Point observed by images 1 and 2, but not 3
    const points3D = new Map<bigint, Point3D>([
      [1n, makePoint3D(1n, 1.0, [
        { imageId: 1, point2DIdx: 0 },
        { imageId: 2, point2DIdx: 0 },
      ])],
    ]);

    const { imageStats } = computeImageStats(images, points3D);

    expect(imageStats.get(1)!.covisibleCount).toBe(1); // sees image 2
    expect(imageStats.get(2)!.covisibleCount).toBe(1); // sees image 1
    expect(imageStats.get(3)!.covisibleCount).toBe(0); // sees nobody
  });

  it('builds connected images index with correct match counts', () => {
    const images = makeImages(1, 2);
    const points3D = new Map<bigint, Point3D>([
      [1n, makePoint3D(1n, 0.1, [
        { imageId: 1, point2DIdx: 0 },
        { imageId: 2, point2DIdx: 0 },
      ])],
      [2n, makePoint3D(2n, 0.2, [
        { imageId: 1, point2DIdx: 1 },
        { imageId: 2, point2DIdx: 1 },
      ])],
    ]);

    const { connectedImagesIndex } = computeImageStats(images, points3D);

    // Both directions should have count 2
    expect(connectedImagesIndex.get(1)!.get(2)).toBe(2);
    expect(connectedImagesIndex.get(2)!.get(1)).toBe(2);
  });

  it('builds imageToPoint3DIds reverse mapping', () => {
    const images = makeImages(1, 2);
    const points3D = new Map<bigint, Point3D>([
      [10n, makePoint3D(10n, 0.1, [
        { imageId: 1, point2DIdx: 0 },
        { imageId: 2, point2DIdx: 0 },
      ])],
      [20n, makePoint3D(20n, 0.2, [
        { imageId: 1, point2DIdx: 1 },
      ])],
    ]);

    const { imageToPoint3DIds } = computeImageStats(images, points3D);

    expect(imageToPoint3DIds.get(1)!.has(10n)).toBe(true);
    expect(imageToPoint3DIds.get(1)!.has(20n)).toBe(true);
    expect(imageToPoint3DIds.get(2)!.has(10n)).toBe(true);
    expect(imageToPoint3DIds.get(2)!.has(20n)).toBe(false);
  });

  it('averages error correctly when multiple points are observed', () => {
    const images = makeImages(1);
    const points3D = new Map<bigint, Point3D>([
      [1n, makePoint3D(1n, 1.0, [{ imageId: 1, point2DIdx: 0 }])],
      [2n, makePoint3D(2n, 3.0, [{ imageId: 1, point2DIdx: 1 }])],
    ]);

    const { imageStats, globalStats } = computeImageStats(images, points3D);

    expect(imageStats.get(1)!.avgError).toBeCloseTo(2.0);
    expect(globalStats.avgError).toBeCloseTo(2.0);
  });

  it('skips negative errors in averaging', () => {
    const images = makeImages(1);
    const points3D = new Map<bigint, Point3D>([
      [1n, makePoint3D(1n, -1, [{ imageId: 1, point2DIdx: 0 }])],
      [2n, makePoint3D(2n, 4.0, [{ imageId: 1, point2DIdx: 1 }])],
    ]);

    const { imageStats, globalStats } = computeImageStats(images, points3D);

    // Only the valid error (4.0) should be counted
    expect(imageStats.get(1)!.numPoints3D).toBe(2);
    expect(imageStats.get(1)!.avgError).toBeCloseTo(4.0);
    expect(globalStats.avgError).toBeCloseTo(4.0);
    expect(globalStats.minError).toBeCloseTo(4.0);
    expect(globalStats.maxError).toBeCloseTo(4.0);
  });

  it('computes global track length stats', () => {
    const images = makeImages(1, 2, 3);
    const points3D = new Map<bigint, Point3D>([
      // Track length 1
      [1n, makePoint3D(1n, 0.1, [{ imageId: 1, point2DIdx: 0 }])],
      // Track length 3
      [2n, makePoint3D(2n, 0.2, [
        { imageId: 1, point2DIdx: 1 },
        { imageId: 2, point2DIdx: 0 },
        { imageId: 3, point2DIdx: 0 },
      ])],
    ]);

    const { globalStats } = computeImageStats(images, points3D);

    expect(globalStats.minTrackLength).toBe(1);
    expect(globalStats.maxTrackLength).toBe(3);
    expect(globalStats.avgTrackLength).toBeCloseTo(2.0); // (1+3)/2
    expect(globalStats.totalObservations).toBe(4); // 1+3
  });
});

// ---------------------------------------------------------------------------
// computeImageStatsFromWasm — WASM typed-array path
// ---------------------------------------------------------------------------

describe('computeImageStatsFromWasm', () => {
  /**
   * Build a mock WasmReconstructionWrapper from a list of points.
   * The CSR format stores tracks as:
   *   trackOffsets[i] = start index into trackImageIds for point i
   *   trackOffsets[pointCount] = total track entries
   */
  function makeMockWasm(
    points: { error: number; trackImageIds: number[]; point3DId?: bigint }[],
  ): WasmReconstructionWrapper {
    const pointCount = points.length;
    const errors = new Float32Array(points.map(p => p.error));

    // Build CSR
    const offsets: number[] = [0];
    const allTrackImageIds: number[] = [];
    const allPoint3DIds: bigint[] = [];
    for (const p of points) {
      allTrackImageIds.push(...p.trackImageIds);
      offsets.push(allTrackImageIds.length);
      allPoint3DIds.push(p.point3DId ?? BigInt(allPoint3DIds.length + 1));
    }

    return {
      pointCount,
      getErrors: () => errors,
      getTrackOffsets: () => new Uint32Array(offsets),
      getTrackImageIds: () => new Uint32Array(allTrackImageIds),
      getPoint3DIds: () => BigInt64Array.from(allPoint3DIds),
    } as unknown as WasmReconstructionWrapper;
  }

  it('returns empty stats with zero points', () => {
    const images = makeImages(1);
    const wasm = makeMockWasm([]);

    const { imageStats, globalStats } = computeImageStatsFromWasm(images, wasm);

    expect(imageStats.get(1)).toEqual({ numPoints3D: 0, avgError: 0, covisibleCount: 0 });
    expect(globalStats.totalPoints).toBe(0);
  });

  it('produces same results as computeImageStats for identical data', () => {
    const images = makeImages(1, 2);

    // JS path data
    const points3D = new Map<bigint, Point3D>([
      [1n, makePoint3D(1n, 0.5, [
        { imageId: 1, point2DIdx: 0 },
        { imageId: 2, point2DIdx: 0 },
      ])],
      [2n, makePoint3D(2n, 1.5, [
        { imageId: 1, point2DIdx: 1 },
      ])],
    ]);

    // Equivalent WASM data
    const wasm = makeMockWasm([
      { error: 0.5, trackImageIds: [1, 2], point3DId: 1n },
      { error: 1.5, trackImageIds: [1], point3DId: 2n },
    ]);

    const jsResult = computeImageStats(images, points3D);
    const wasmResult = computeImageStatsFromWasm(images, wasm);

    // Per-image stats should match
    for (const id of [1, 2]) {
      expect(wasmResult.imageStats.get(id)!.numPoints3D).toBe(
        jsResult.imageStats.get(id)!.numPoints3D,
      );
      expect(wasmResult.imageStats.get(id)!.avgError).toBeCloseTo(
        jsResult.imageStats.get(id)!.avgError,
      );
      expect(wasmResult.imageStats.get(id)!.covisibleCount).toBe(
        jsResult.imageStats.get(id)!.covisibleCount,
      );
    }

    // Global stats should match
    expect(wasmResult.globalStats.totalPoints).toBe(jsResult.globalStats.totalPoints);
    expect(wasmResult.globalStats.totalObservations).toBe(jsResult.globalStats.totalObservations);
    expect(wasmResult.globalStats.avgError).toBeCloseTo(jsResult.globalStats.avgError);
    expect(wasmResult.globalStats.minTrackLength).toBe(jsResult.globalStats.minTrackLength);
    expect(wasmResult.globalStats.maxTrackLength).toBe(jsResult.globalStats.maxTrackLength);

    // Connected images index should match
    expect(wasmResult.connectedImagesIndex.get(1)!.get(2)).toBe(
      jsResult.connectedImagesIndex.get(1)!.get(2),
    );
  });

  it('handles negative errors by skipping them in averages', () => {
    const images = makeImages(1);
    const wasm = makeMockWasm([
      { error: -1, trackImageIds: [1] },
      { error: 2.0, trackImageIds: [1] },
    ]);

    const { imageStats, globalStats } = computeImageStatsFromWasm(images, wasm);

    expect(imageStats.get(1)!.numPoints3D).toBe(2);
    expect(imageStats.get(1)!.avgError).toBeCloseTo(2.0);
    expect(globalStats.avgError).toBeCloseTo(2.0);
  });

  it('builds imageToPoint3DIds from WASM data', () => {
    const images = makeImages(1, 2);
    const wasm = makeMockWasm([
      { error: 0.1, trackImageIds: [1, 2], point3DId: 10n },
      { error: 0.2, trackImageIds: [1], point3DId: 20n },
    ]);

    const { imageToPoint3DIds } = computeImageStatsFromWasm(images, wasm);

    expect(imageToPoint3DIds.get(1)!.has(10n)).toBe(true);
    expect(imageToPoint3DIds.get(1)!.has(20n)).toBe(true);
    expect(imageToPoint3DIds.get(2)!.has(10n)).toBe(true);
    expect(imageToPoint3DIds.get(2)!.has(20n)).toBe(false);
  });
});
