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
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parseCamerasBinary } from './cameras';
import { parseImagesBinary } from './images';
import { parsePoints3DBinary } from './points3d';
import { writeCamerasBinary, writeImagesBinary, writePoints3DBinary } from './writers';
import type { Camera, Image, Point3D, Reconstruction } from '../types/colmap';
import { CameraModelId } from '../types/colmap';
import { WasmReconstructionWrapper } from '../wasm/reconstruction';
import type { ColmapWasmModule } from '../wasm/types';
import {
  createSim3dFromEuler,
  transformReconstruction,
} from '../utils/sim3dTransforms';
import { filterReconstructionByImageIds } from '../store/actions/deletionActions';

const BIN = 'C:/Users/HEQ/Projects/colmap_webview/360_v2/bicycle/sparse/0';
const WASM_JS = resolve(process.cwd(), 'public/wasm/colmap_wasm.js');
const WASM_BIN = resolve(process.cwd(), 'public/wasm/colmap_wasm.wasm');

type Factory = (opts: { wasmBinary: Buffer; locateFile?: (f: string) => string }) => Promise<ColmapWasmModule>;

async function makeWrapperInNode(): Promise<WasmReconstructionWrapper> {
  const require = createRequire(import.meta.url);
  const mod = require(WASM_JS) as { default?: Factory } | Factory;
  const factory = (typeof mod === 'function' ? mod : mod.default) as Factory;
  const wasmBinary = readFileSync(WASM_BIN);
  const module = await factory({
    wasmBinary,
    locateFile: (f) => resolve(process.cwd(), 'public/wasm', f),
  });
  // The wrapper's initialize() calls loadColmapWasm() which fetches — skip it
  // and inject the Node-loaded module directly. Private fields, so cast.
  const wrapper = new WasmReconstructionWrapper();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const internal = wrapper as any;
  internal.module = module;
  internal.reconstruction = new module.Reconstruction();
  return wrapper;
}

function toAB(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
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

const missingFixture = !existsSync(`${BIN}/cameras.bin`) || !existsSync(WASM_JS) || !existsSync(WASM_BIN);

describe.skipIf(missingFixture)('exported binary integrity (bicycle, WASM-mode)', () => {
  it('round-trips the untransformed reconstruction with consistent tracks', async () => {
    const wasm = await makeWrapperInNode();
    wasm.parseCameras(toAB(`${BIN}/cameras.bin`));
    wasm.parseImages(toAB(`${BIN}/images.bin`));
    wasm.parsePoints3D(toAB(`${BIN}/points3D.bin`));

    const cameras = new Map<number, Camera>();
    for (const c of Object.values(wasm.getAllCameras())) {
      cameras.set(c.cameraId, {
        cameraId: c.cameraId,
        modelId: c.modelId as CameraModelId,
        width: c.width,
        height: c.height,
        params: c.params,
      });
    }

    // Build JS images with empty points2D (what the app holds in WASM mode)
    const images = new Map<number, Image>();
    for (const info of wasm.getAllImageInfos()) {
      const q = info.quaternion ?? [1, 0, 0, 0];
      const t = info.translation ?? [0, 0, 0];
      images.set(info.imageId, {
        imageId: info.imageId,
        qvec: [q[0], q[1], q[2], q[3]],
        tvec: [t[0], t[1], t[2]],
        cameraId: info.cameraId,
        name: info.name,
        points2D: [],
      });
    }

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
  });

  it('survives applyTransformToData-style bake (realizes 2D points before dropping WASM)', async () => {
    const wasm = await makeWrapperInNode();
    wasm.parseCameras(toAB(`${BIN}/cameras.bin`));
    wasm.parseImages(toAB(`${BIN}/images.bin`));
    wasm.parsePoints3D(toAB(`${BIN}/points3D.bin`));

    const cameras = new Map<number, Camera>();
    for (const c of Object.values(wasm.getAllCameras())) {
      cameras.set(c.cameraId, {
        cameraId: c.cameraId,
        modelId: c.modelId as CameraModelId,
        width: c.width,
        height: c.height,
        params: c.params,
      });
    }
    const images = new Map<number, Image>();
    for (const info of wasm.getAllImageInfos()) {
      const q = info.quaternion ?? [1, 0, 0, 0];
      const t = info.translation ?? [0, 0, 0];
      images.set(info.imageId, {
        imageId: info.imageId,
        qvec: [q[0], q[1], q[2], q[3]],
        tvec: [t[0], t[1], t[2]],
        cameraId: info.cameraId,
        name: info.name,
        points2D: [],
      });
    }
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
  });

  it('survives applyDeletionsToData in WASM mode (realizes points3D, filters tracks)', async () => {
    const wasm = await makeWrapperInNode();
    wasm.parseCameras(toAB(`${BIN}/cameras.bin`));
    wasm.parseImages(toAB(`${BIN}/images.bin`));
    wasm.parsePoints3D(toAB(`${BIN}/points3D.bin`));

    const cameras = new Map<number, Camera>();
    for (const c of Object.values(wasm.getAllCameras())) {
      cameras.set(c.cameraId, {
        cameraId: c.cameraId,
        modelId: c.modelId as CameraModelId,
        width: c.width,
        height: c.height,
        params: c.params,
      });
    }
    const images = new Map<number, Image>();
    for (const info of wasm.getAllImageInfos()) {
      const q = info.quaternion ?? [1, 0, 0, 0];
      const t = info.translation ?? [0, 0, 0];
      images.set(info.imageId, {
        imageId: info.imageId,
        qvec: [q[0], q[1], q[2], q[3]],
        tvec: [t[0], t[1], t[2]],
        cameraId: info.cameraId,
        name: info.name,
        points2D: [],
      });
    }
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
  });

  it('regression: WITHOUT the applyTransformToData fix, integrity is violated', async () => {
    // This test documents the bug the fix targets. We intentionally skip
    // realizing points2D, then assert the integrity check fails.
    const wasm = await makeWrapperInNode();
    wasm.parseCameras(toAB(`${BIN}/cameras.bin`));
    wasm.parseImages(toAB(`${BIN}/images.bin`));
    wasm.parsePoints3D(toAB(`${BIN}/points3D.bin`));

    const images = new Map<number, Image>();
    for (const info of wasm.getAllImageInfos()) {
      const q = info.quaternion ?? [1, 0, 0, 0];
      const t = info.translation ?? [0, 0, 0];
      images.set(info.imageId, {
        imageId: info.imageId,
        qvec: [q[0], q[1], q[2], q[3]],
        tvec: [t[0], t[1], t[2]],
        cameraId: info.cameraId,
        name: info.name,
        points2D: [], // Empty — this is the bug state before the fix
      });
    }
    const points3D = wasm.buildPoints3DMap();

    // Write without wasm fallback and without realizing 2D points
    const imgBuf = writeImagesBinary(images, null);
    const ptBuf = writePoints3DBinary(points3D);
    const reImages = parseImagesBinary(imgBuf);
    const rePoints = parsePoints3DBinary(ptBuf);

    expect(() => assertIntegrity(reImages, rePoints)).toThrow(/out of range/);
  });
});
