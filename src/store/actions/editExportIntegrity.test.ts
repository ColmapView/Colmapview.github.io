import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { File as NodeFile } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCamerasBinary } from '../../parsers/cameras';
import { parseImagesBinary } from '../../parsers/images';
import { parsePoints3DBinary } from '../../parsers/points3d';
import { writeCamerasBinary, writeImagesBinary, writePoints3DBinary } from '../../parsers/colmapBinaryWriters';
import { buildCamera, buildImage, buildPoint2D, buildPoint3D, buildReconstruction } from '../../test/builders';
import { copyBytesToArrayBuffer } from '../../test/builders/fileFakes';
import { buildWasmCameraImageMaps, resolveColmapWasmFactory } from '../../test/builders/wasmFakes';
import type { Image, Point3D } from '../../types/colmap';
import { appLogger } from '../../utils/logger';
import { WasmReconstructionWrapper } from '../../wasm/reconstruction';
import { isReconstructionSnapshot, ReconstructionService } from '../../wasm/reconstructionService';
import type { ColmapWasmModule } from '../../wasm/types';
import { useReconstructionStore } from '../reconstructionStore';
import { useDeletionStore } from '../stores/deletionStore';
import { useTransformStore } from '../stores/transformStore';
import { applyDeletionsToData } from './deletionActions';
import { applyTransformToData } from './transformActions';

let wasmModule: Promise<ColmapWasmModule>;
function loadWasm() {
  return wasmModule ??= (async () => {
    const factory = resolveColmapWasmFactory(await import(pathToFileURL(resolve('public/wasm/colmap_wasm.js')).href));
    return factory({ wasmBinary: readFileSync(resolve('public/wasm/colmap_wasm.wasm')) });
  })();
}
// Only the module transport is adapted for Node; parsing, edits and exports use real code.
vi.mock('../../wasm/init', async original => ({
  ...await original<typeof import('../../wasm/init')>(),
  loadColmapWasm: () => loadWasm(),
}));

const pointId = 9007199254740997n;
const camera = buildCamera({ cameraId: 9 });
const images = [7, 42].map(imageId => buildImage({
  imageId, cameraId: camera.cameraId, name: `image-${imageId}.jpg`, numPoints2D: 3,
  points2D: [buildPoint2D({ point3DId: pointId }), buildPoint2D(), buildPoint2D({ point3DId: 73n })],
}));
const original = buildReconstruction({
  cameras: [camera], images,
  points3D: [pointId, 73n].map((id, index) => buildPoint3D({
    point3DId: id, xyz: [2 + index, 3, 4],
    track: images.map(image => ({ imageId: image.imageId, point2DIdx: index === 0 ? 0 : 2 })),
  })),
});
const binary = {
  cameras: writeCamerasBinary(original.cameras),
  images: writeImagesBinary(original.images),
  points3D: writePoints3DBinary(original.points3D!),
};
const owners: Array<{ dispose(): void }> = [];

beforeEach(() => {
  useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  useDeletionStore.setState(useDeletionStore.getInitialState(), true);
  useTransformStore.setState(useTransformStore.getInitialState(), true);
  vi.spyOn(appLogger, 'info').mockImplementation(() => undefined);
  vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  useReconstructionStore.getState().clear();
  owners.splice(0).forEach(owner => owner.dispose());
  vi.restoreAllMocks();
});

async function loadScene(kind: 'legacy WASM' | 'service snapshot') {
  const store = useReconstructionStore.getState();
  if (kind === 'service snapshot') {
    const service = new ReconstructionService({
      camerasFile: new NodeFile([binary.cameras], 'cameras.bin') as unknown as File,
      imagesFile: new NodeFile([binary.images], 'images.bin') as unknown as File,
      points3DFile: new NodeFile([binary.points3D], 'points3D.bin') as unknown as File,
    }, { workerFactory: null });
    owners.push(service);
    const snapshot = await service.load();
    expect(snapshot.data.diagnostics.parser).toBe('wasm');
    store.setWasmReconstruction(snapshot);
    store.setReconstruction(snapshot.reconstruction);
  } else {
    const module = await loadWasm();
    const wrapper = new WasmReconstructionWrapper();
    Reflect.set(wrapper, 'module', module);
    Reflect.set(wrapper, 'reconstruction', new module.Reconstruction());
    owners.push(wrapper);
    expect(wrapper.parseCameras(binary.cameras)).toBe(true);
    expect(wrapper.parseImages(binary.images)).toBe(true);
    expect(wrapper.parsePoints3D(binary.points3D)).toBe(true);
    const { cameras, images } = buildWasmCameraImageMaps(wrapper);
    store.setWasmReconstruction(wrapper);
    store.setReconstruction(buildReconstruction({ cameras: [...cameras.values()], images: [...images.values()] }));
  }
  // Both paths keep observations with their owner until an edit/export needs them.
  expect([...useReconstructionStore.getState().reconstruction!.images.values()].every(image => image.points2D.length === 0)).toBe(true);
}

async function exportScene() {
  const { reconstruction, wasmReconstruction: source } = useReconstructionStore.getState();
  if (!reconstruction) throw new Error('No scene loaded');
  const files = isReconstructionSnapshot(source)
    ? await source.export({ format: 'binary' })
    : {
      'cameras.bin': new Uint8Array(writeCamerasBinary(reconstruction.cameras)),
      'images.bin': new Uint8Array(writeImagesBinary(reconstruction.images, source)),
      'points3D.bin': new Uint8Array(writePoints3DBinary(
        reconstruction.points3D?.size ? reconstruction.points3D : source?.buildPoints3DMap() ?? new Map()
      )),
    };
  return {
    cameras: parseCamerasBinary(copyBytesToArrayBuffer(files['cameras.bin'])),
    images: parseImagesBinary(copyBytesToArrayBuffer(files['images.bin'])),
    points3D: parsePoints3DBinary(copyBytesToArrayBuffer(files['points3D.bin'])),
  };
}

function assertIntegrity(images: Map<number, Image>, points: Map<bigint, Point3D>) {
  for (const [id, point] of points) for (const track of point.track) {
    const image = images.get(track.imageId);
    if (!image) throw new Error(`Point ${id} references missing image ${track.imageId}`);
    const observation = image.points2D[track.point2DIdx];
    if (!observation) throw new Error(`Point ${id} observation index is out of range`);
    if (observation.point3DId !== id) throw new Error(`Point ${id} observation references another point`);
  }
}

describe.each(['legacy WASM', 'service snapshot'] as const)('edit/export integrity: %s', kind => {
  beforeEach(async () => { await loadScene(kind); });

  it('exports all original observations and uint64 point IDs', async () => {
    const exported = await exportScene();
    expect(exported.cameras).toEqual(original.cameras);
    expect(exported.images).toEqual(original.images);
    expect(exported.points3D).toEqual(original.points3D);
    assertIntegrity(exported.images, exported.points3D);
  });

  it('exports rotated poses and points after the production transform action', async () => {
    useTransformStore.getState().setTransform({ rotationY: Math.PI / 4 });
    expect(await applyTransformToData()).toBe(true);
    const exported = await exportScene();
    const xyz = exported.points3D.get(pointId)!.xyz;
    expect(xyz[0]).toBeCloseTo(3 * Math.SQRT2);
    expect(xyz[1]).toBeCloseTo(3);
    expect(xyz[2]).toBeCloseTo(Math.SQRT2);
    const qvec = exported.images.get(7)!.qvec;
    expect(qvec[0]).toBeCloseTo(Math.cos(Math.PI / 8));
    expect(qvec[2]).toBeCloseTo(-Math.sin(Math.PI / 8));
    expect(useTransformStore.getState().transform.rotationY).toBe(0);
    expect(exported.images.get(7)!.points2D).toEqual(images[0].points2D);
    assertIntegrity(exported.images, exported.points3D);
  });

  it('exports only surviving observations after the production deletion action', async () => {
    useDeletionStore.getState().markForDeletion(42);
    expect(await applyDeletionsToData()).toBe(true);
    const exported = await exportScene();
    expect([...exported.images.keys()]).toEqual([7]);
    expect(exported.points3D.size).toBe(2);
    for (const point of exported.points3D.values()) {
      expect(point.track).toEqual([{ imageId: 7, point2DIdx: point.point3DId === pointId ? 0 : 2 }]);
    }
    expect(useDeletionStore.getState().pendingDeletions.size).toBe(0);
    assertIntegrity(exported.images, exported.points3D);
  });
});

it('rejects the historical dangling-track export as a negative control', () => {
  const empty = new Map(images.map(image => [image.imageId, { ...image, points2D: [] }]));
  const exported = parseImagesBinary(writeImagesBinary(empty, null));
  expect(() => assertIntegrity(exported, original.points3D!)).toThrow('out of range');
});
