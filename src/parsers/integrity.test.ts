/**
 * End-to-end integrity test for the WASM-mode export paths.
 *
 * Guards the two pycolmap-crashing bugs fixed in v0.5.8:
 *  (1) `applyTransformToData` used to null the WASM wrapper leaving images
 *      with empty `points2D` but intact `points3D` tracks. pycolmap's
 *      Reconstruction loader then accesses `images[X].points2D.at(idx)` on
 *      a size-0 vector → `IndexError: __n >= size() (0)`.
 *  (2) `applyDeletionsToData` in WASM mode skipped filtering `points3D`
 *      tracks (because JS `points3D` was empty), leaving tracks that
 *      reference deleted images in the exported file.
 *
 * Both manifest only with the real WASM parser path. This test loads the
 * Emscripten module directly in Node, exercises the fixes, writes the
 * three bins via the real writers, re-parses them, and asserts every
 * track element resolves to a valid (image, points2D[idx]).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCamerasBinary } from './cameras';
import { parseImagesBinary } from './images';
import { parsePoints3DBinary } from './points3d';
import { writeCamerasBinary, writeImagesBinary, writePoints3DBinary } from './writers';
import type { Image, Point3D, Reconstruction } from '../types/colmap';
import { WasmReconstructionWrapper } from '../wasm/reconstruction';
import {
  createSim3dFromEuler,
  transformReconstruction,
} from '../utils/sim3dTransforms';
import {
  buildWasmCameraImageMaps,
  resolveColmapWasmFactory,
} from '../test/builders/wasmFakes';
import { copyBytesToArrayBuffer } from '../test/builders/fileFakes';
import { filterReconstructionByImageIds } from '../store/actions/deletionActions';
import {
  getBicycleFixtureDir,
  hasSparseBinaryFixture,
} from '../../tests/colmapFixturePaths';

const BIN = getBicycleFixtureDir();
const WASM_JS = resolve(process.cwd(), 'public/wasm/colmap_wasm.js');
const WASM_BIN = resolve(process.cwd(), 'public/wasm/colmap_wasm.wasm');
const INTEGRITY_TEST_TIMEOUT_MS = 15000;

async function makeWrapperInNode(): Promise<WasmReconstructionWrapper> {
  const factory = resolveColmapWasmFactory(await import(pathToFileURL(WASM_JS).href));
  const wasmBinary = readFileSync(WASM_BIN);
  const module = await factory({
    wasmBinary,
    locateFile: (f) => resolve(process.cwd(), 'public/wasm', f),
  });
  // The wrapper's initialize() calls loadColmapWasm() which fetches; inject
  // the Node-loaded module directly.
  const wrapper = new WasmReconstructionWrapper();
  Reflect.set(wrapper, 'module', module);
  Reflect.set(wrapper, 'reconstruction', new module.Reconstruction());
  return wrapper;
}

function toAB(path: string): ArrayBuffer {
  return copyBytesToArrayBuffer(readFileSync(path));
}

/**
 * The core integrity check pycolmap implicitly performs: for every points3D
 * track element (image_id, point2D_idx), the referenced image must exist and
 * have at least `point2D_idx + 1` entries in its points2D array.
 */
function assertIntegrity(images: Map<number, Image>, points3D: Map<bigint, Point3D>): void {
  for (const [pointId, point] of points3D) {
    for (const elem of point.track) {
      const img = images.get(elem.imageId);
      if (!img) {
        throw new Error(`point3D ${pointId}: track references missing image_id=${elem.imageId}`);
      }
      if (elem.point2DIdx >= img.points2D.length) {
        throw new Error(
          `point3D ${pointId}: track element image_id=${elem.imageId} point2D_idx=${elem.point2DIdx} ` +
            `out of range (image has ${img.points2D.length} points2D)`,
        );
      }
    }
  }
}

const missingFixture = !hasSparseBinaryFixture(BIN) || !existsSync(WASM_JS) || !existsSync(WASM_BIN);

describe.skipIf(missingFixture)('exported binary integrity (bicycle, WASM-mode)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('round-trips the untransformed reconstruction with consistent tracks', async () => {
    const wasm = await makeWrapperInNode();
    wasm.parseCameras(toAB(resolve(BIN, 'cameras.bin')));
    wasm.parseImages(toAB(resolve(BIN, 'images.bin')));
    wasm.parsePoints3D(toAB(resolve(BIN, 'points3D.bin')));

    // Build JS images with empty points2D (what the app holds in WASM mode)
    const { cameras, images } = buildWasmCameraImageMaps(wasm);

    // Write using WASM fallback for 2D points
    const camBuf = writeCamerasBinary(cameras);
    const imgBuf = writeImagesBinary(images, wasm);
    const ptBuf = writePoints3DBinary(wasm.buildPoints3DMap());

    const reCameras = parseCamerasBinary(camBuf);
    const reImages = parseImagesBinary(imgBuf);
    const rePoints = parsePoints3DBinary(ptBuf);

    expect(reCameras.size).toBe(cameras.size);
    expect(reImages.size).toBe(images.size);
    expect(rePoints.size).toBeGreaterThan(0);
    assertIntegrity(reImages, rePoints);
  }, INTEGRITY_TEST_TIMEOUT_MS);

  it('survives applyTransformToData-style bake (realizes 2D points before dropping WASM)', async () => {
    const wasm = await makeWrapperInNode();
    wasm.parseCameras(toAB(resolve(BIN, 'cameras.bin')));
    wasm.parseImages(toAB(resolve(BIN, 'images.bin')));
    wasm.parsePoints3D(toAB(resolve(BIN, 'points3D.bin')));

    const { cameras, images } = buildWasmCameraImageMaps(wasm);
    const reconstruction: Reconstruction = { cameras, images };

    // Simulate the fixed applyTransformToData:
    //  1. Transform with a non-identity Sim3D
    //  2. Realize 2D points from WASM into the JS image records
    //  3. Drop the WASM wrapper
    const sim3d = createSim3dFromEuler({
      scale: 1.5,
      rotationX: 0.1,
      rotationY: 0.7,
      rotationZ: -0.2,
      translationX: 0.3,
      translationY: 0.0,
      translationZ: 0.1,
    });
    const transformed = transformReconstruction(sim3d, reconstruction, wasm);
    for (const [imageId, image] of transformed.images) {
      if (image.points2D.length === 0) {
        const points2D = wasm.getImagePoints2DArray(imageId);
        if (points2D.length > 0) {
          transformed.images.set(imageId, { ...image, points2D });
        }
      }
    }
    // WASM wrapper is now "dropped" — we intentionally write without passing it
    const wasmAfter = null;

    const imgBuf = writeImagesBinary(transformed.images, wasmAfter);
    const ptBuf = writePoints3DBinary(transformed.points3D!);

    const reImages = parseImagesBinary(imgBuf);
    const rePoints = parsePoints3DBinary(ptBuf);

    // Integrity: every track resolves into a non-empty points2D array
    assertIntegrity(reImages, rePoints);
    // Sanity: at least some points2D survived the realization
    let totalPoints2D = 0;
    for (const img of reImages.values()) totalPoints2D += img.points2D.length;
    expect(totalPoints2D).toBeGreaterThan(0);
  }, INTEGRITY_TEST_TIMEOUT_MS);

  it('survives applyDeletionsToData in WASM mode (realizes points3D, filters tracks)', async () => {
    const wasm = await makeWrapperInNode();
    wasm.parseCameras(toAB(resolve(BIN, 'cameras.bin')));
    wasm.parseImages(toAB(resolve(BIN, 'images.bin')));
    wasm.parsePoints3D(toAB(resolve(BIN, 'points3D.bin')));

    const { cameras, images } = buildWasmCameraImageMaps(wasm);
    const reconstruction: Reconstruction = {
      cameras,
      images,
      imageStats: new Map(),
      connectedImagesIndex: new Map(),
      imageToPoint3DIds: new Map(),
      globalStats: {
        minError: 0, maxError: 0, avgError: 0,
        minTrackLength: 0, maxTrackLength: 0, avgTrackLength: 0,
        totalObservations: 0, totalPoints: 0,
      },
    };

    // Pretend user deleted every 5th image
    const deleted = new Set<number>();
    let i = 0;
    for (const id of images.keys()) {
      if (i++ % 5 === 0) deleted.add(id);
    }
    expect(deleted.size).toBeGreaterThan(0);

    // Simulate the fixed applyDeletionsToData:
    // Realize points3D from WASM before filtering so tracks get stripped.
    const withPoints3D: Reconstruction = { ...reconstruction, points3D: wasm.buildPoints3DMap() };
    const filtered = filterReconstructionByImageIds(withPoints3D, deleted);
    expect(filtered).not.toBeNull();

    const imgBuf = writeImagesBinary(filtered!.images, wasm);
    const ptBuf = writePoints3DBinary(filtered!.points3D!);

    const reImages = parseImagesBinary(imgBuf);
    const rePoints = parsePoints3DBinary(ptBuf);

    // No exported image should be a deleted one
    for (const id of reImages.keys()) expect(deleted.has(id)).toBe(false);

    // No track should reference a deleted image
    for (const point of rePoints.values()) {
      for (const elem of point.track) {
        expect(deleted.has(elem.imageId)).toBe(false);
      }
    }

    // Full pycolmap-style integrity
    assertIntegrity(reImages, rePoints);
  }, INTEGRITY_TEST_TIMEOUT_MS);

  it('regression: WITHOUT the applyTransformToData fix, integrity is violated', async () => {
    // This test documents the bug the fix targets. We intentionally skip
    // realizing points2D, then assert the integrity check fails.
    const wasm = await makeWrapperInNode();
    wasm.parseCameras(toAB(resolve(BIN, 'cameras.bin')));
    wasm.parseImages(toAB(resolve(BIN, 'images.bin')));
    wasm.parsePoints3D(toAB(resolve(BIN, 'points3D.bin')));

    const { images } = buildWasmCameraImageMaps(wasm);
    const points3D = wasm.buildPoints3DMap();

    // Write without wasm fallback and without realizing 2D points
    const imgBuf = writeImagesBinary(images, null);
    const ptBuf = writePoints3DBinary(points3D);
    const reImages = parseImagesBinary(imgBuf);
    const rePoints = parsePoints3DBinary(ptBuf);

    expect(() => assertIntegrity(reImages, rePoints)).toThrow(/out of range/);
  }, INTEGRITY_TEST_TIMEOUT_MS);
});
