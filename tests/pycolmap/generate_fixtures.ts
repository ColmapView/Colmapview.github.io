/**
 * Produces COLMAP binary fixtures from our real writers, for pycolmap to load.
 *
 * Each scenario writes to tests/pycolmap/fixtures/<name>/sparse/0/{cameras,images,points3D}.bin
 *
 * Run:
 *   npx tsx tests/pycolmap/generate_fixtures.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  writeCamerasBinary,
  writeImagesBinary,
  writePoints3DBinary,
} from '../../src/parsers/writers';
import type { Camera, Image, Reconstruction } from '../../src/types/colmap';
import { CameraModelId } from '../../src/types/colmap';
import { WasmReconstructionWrapper } from '../../src/wasm/reconstruction';
import type { ColmapWasmModule } from '../../src/wasm/types';
import {
  createSim3dFromEuler,
  transformReconstruction,
} from '../../src/utils/sim3dTransforms';
import { filterReconstructionByImageIds } from '../../src/store/actions/deletionActions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..');
const BICYCLE_BIN = 'C:/Users/HEQ/Projects/colmap_webview/360_v2/bicycle/sparse/0';
const WASM_JS = resolve(ROOT, 'public/wasm/colmap_wasm.js');
const WASM_BIN = resolve(ROOT, 'public/wasm/colmap_wasm.wasm');
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

type Factory = (opts: { wasmBinary: Buffer; locateFile?: (f: string) => string }) => Promise<ColmapWasmModule>;

async function loadWasm(): Promise<WasmReconstructionWrapper> {
  const require = createRequire(import.meta.url);
  const mod = require(WASM_JS) as { default?: Factory } | Factory;
  const factory = (typeof mod === 'function' ? mod : mod.default) as Factory;
  const wasmBinary = readFileSync(WASM_BIN);
  const module = await factory({
    wasmBinary,
    locateFile: (f) => resolve(ROOT, 'public/wasm', f),
  });
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

function writeScenario(
  name: string,
  camBuf: ArrayBuffer,
  imgBuf: ArrayBuffer,
  ptBuf: ArrayBuffer,
): void {
  const dir = resolve(FIXTURES_DIR, name, 'sparse', '0');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'cameras.bin'), Buffer.from(camBuf));
  writeFileSync(resolve(dir, 'images.bin'), Buffer.from(imgBuf));
  writeFileSync(resolve(dir, 'points3D.bin'), Buffer.from(ptBuf));
  console.log(`[fixtures] wrote ${name}`);
}

async function buildCamerasAndImages(
  wasm: WasmReconstructionWrapper,
): Promise<{ cameras: Map<number, Camera>; images: Map<number, Image> }> {
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
  return { cameras, images };
}

async function main(): Promise<void> {
  if (!existsSync(BICYCLE_BIN)) {
    console.error(`[fixtures] bicycle fixture not found at ${BICYCLE_BIN} — skipping`);
    process.exit(0);
  }
  if (!existsSync(WASM_JS) || !existsSync(WASM_BIN)) {
    console.error('[fixtures] WASM artifacts missing — run `npm run build:wasm` first');
    process.exit(1);
  }

  const wasm = await loadWasm();
  wasm.parseCameras(toAB(`${BICYCLE_BIN}/cameras.bin`));
  wasm.parseImages(toAB(`${BICYCLE_BIN}/images.bin`));
  wasm.parsePoints3D(toAB(`${BICYCLE_BIN}/points3D.bin`));

  // Scenario 1: untransformed — writer uses WASM fallback for 2D
  {
    const { cameras, images } = await buildCamerasAndImages(wasm);
    const camBuf = writeCamerasBinary(cameras);
    const imgBuf = writeImagesBinary(images, wasm);
    const ptBuf = writePoints3DBinary(wasm.buildPoints3DMap());
    writeScenario('untransformed', camBuf, imgBuf, ptBuf);
  }

  // Scenario 2: transform baked — simulate applyTransformToData behaviour
  {
    const { cameras, images } = await buildCamerasAndImages(wasm);
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
    const eulerParams = {
      scale: 1.5,
      rotationX: 0.1,
      rotationY: 0.7,
      rotationZ: -0.2,
      translationX: 0.3,
      translationY: 0,
      translationZ: 0.1,
    };
    const sim3d = createSim3dFromEuler(eulerParams);
    // Sidecar: record the applied sim3d so Python can reconstruct the expected
    // transformation independently.
    const sidecar = {
      euler: eulerParams,
      sim3d: {
        scale: sim3d.scale,
        rotation_quat_xyzw: [sim3d.rotation.x, sim3d.rotation.y, sim3d.rotation.z, sim3d.rotation.w],
        translation: [sim3d.translation.x, sim3d.translation.y, sim3d.translation.z],
      },
    };
    const transformed = transformReconstruction(sim3d, reconstruction, wasm);
    for (const [imageId, image] of transformed.images) {
      if (image.points2D.length === 0) {
        const points2D = wasm.getImagePoints2DArray(imageId);
        if (points2D.length > 0) {
          transformed.images.set(imageId, { ...image, points2D });
        }
      }
    }
    // WASM wrapper "dropped" after bake
    const camBuf = writeCamerasBinary(transformed.cameras);
    const imgBuf = writeImagesBinary(transformed.images, null);
    const ptBuf = writePoints3DBinary(transformed.points3D!);
    writeScenario('transform_baked', camBuf, imgBuf, ptBuf);
    // Write sidecar alongside the scenario root
    writeFileSync(
      resolve(FIXTURES_DIR, 'transform_baked', 'sim3d.json'),
      JSON.stringify(sidecar, null, 2),
    );
  }

  // Scenario 3: deletions applied — WASM mode (simulates fixed applyDeletionsToData)
  {
    const { cameras, images } = await buildCamerasAndImages(wasm);
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
    // Delete every 7th image
    const deleted = new Set<number>();
    let i = 0;
    for (const id of images.keys()) {
      if (i++ % 7 === 0) deleted.add(id);
    }
    const withPoints3D: Reconstruction = { ...reconstruction, points3D: wasm.buildPoints3DMap() };
    const filtered = filterReconstructionByImageIds(withPoints3D, deleted)!;
    const camBuf = writeCamerasBinary(filtered.cameras);
    const imgBuf = writeImagesBinary(filtered.images, wasm);
    const ptBuf = writePoints3DBinary(filtered.points3D!);
    writeScenario('deletions_applied', camBuf, imgBuf, ptBuf);
  }

  // Scenario 4: the pre-fix bug state — images with empty points2D + no wasm.
  // pycolmap should reject this (or at least produce inconsistent data). We
  // ship it so the python test can assert that WE catch the crash.
  {
    const { cameras, images } = await buildCamerasAndImages(wasm);
    const camBuf = writeCamerasBinary(cameras);
    const imgBuf = writeImagesBinary(images, null); // no 2D fallback
    const ptBuf = writePoints3DBinary(wasm.buildPoints3DMap());
    writeScenario('bug_empty_points2D', camBuf, imgBuf, ptBuf);
  }

  console.log('[fixtures] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
