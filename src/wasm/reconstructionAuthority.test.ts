import { afterEach, describe, expect, it, vi } from 'vitest';
import { File as NodeFile } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ReconstructionAuthority } from './reconstructionAuthority';
import { reconstructionResultTransfers, type ReconstructionLoadFiles, type ReconstructionOperation, type ReconstructionOperationPayloads, type ReconstructionOperationResults, type ReconstructionRequest } from './reconstructionProtocol';
import type { ColmapWasmModule } from './types';
import { resolveColmapWasmFactory } from '../test/builders/wasmFakes';
import { buildCamera, buildImage, buildPoint2D, buildPoint3D, buildReconstruction, buildRig, buildRigData, buildFrame } from '../test/builders/colmapBuilders';
import { writeCamerasBinary, writeImagesBinary, writePoints3DBinary, writeRigsBinary, writeFramesBinary } from '../parsers/colmapBinaryWriters';
import { writeCamerasText, writeImagesText, writePoints3DText, writeRigsText, writeFramesText } from '../parsers/colmapTextWriters';
import { parseCamerasBinary } from '../parsers/cameras';
import { parseImagesBinary, parseImagesText } from '../parsers/images';
import { parsePoints3DBinary } from '../parsers/points3d';
import { parseFramesBinary } from '../parsers/frames';
import { computeImageStats } from '../parsers/imageStats';
import { createIdentityEuler } from '../utils/sim3dTransforms';
import { CameraModelId } from '../types/colmap';
import { SensorType } from '../types/rig';
import { createPointMembershipViews } from './compactPointMembership';

let wasmModule: Promise<ColmapWasmModule> | undefined;
const File = NodeFile as unknown as typeof globalThis.File;
vi.mock('./init', async original => ({
  ...await original<typeof import('./init')>(),
  loadColmapWasm: () => wasmModule ??= (async () => {
    const factory = resolveColmapWasmFactory(await import(pathToFileURL(resolve('public/wasm/colmap_wasm.js')).href));
    return factory({ wasmBinary: readFileSync(resolve('public/wasm/colmap_wasm.wasm')) });
  })(),
}));

const pointId = 9007199254740997n;
const camera = buildCamera({ cameraId: 9 });
const images = [7, 42].map((imageId, index) => buildImage({
  imageId, cameraId: camera.cameraId, name: `image-${imageId}.png`, tvec: [index, 0, 0],
  points2D: [buildPoint2D({ xy: [1.25, 2.5], point3DId: pointId }), buildPoint2D({ xy: [9, 8] }), buildPoint2D({ xy: [3, 4], point3DId: 73n })],
}));
const points = [pointId, 73n].map((id, index) => buildPoint3D({
  point3DId: id, xyz: [1 + index, 2 + index, 3 + index], rgb: [10, 100, 250], error: 0.25,
  track: images.map(image => ({ imageId: image.imageId, point2DIdx: index === 0 ? 0 : 2 })),
}));
const sensorId = { type: SensorType.CAMERA, id: 9 };
const original = buildReconstruction({
  cameras: [camera], images, points3D: points,
  rigData: buildRigData({ rigs: [buildRig({ rigId: 11, refSensorId: sensorId, sensors: [{ sensorId, hasPose: false }] })],
    frames: images.map(image => buildFrame({ frameId: image.imageId, rigId: 11, dataIds: [{ sensorId, dataId: image.imageId }] })),
  }),
});

function files(format: 'binary' | 'text'): ReconstructionLoadFiles {
  const binary = format === 'binary';
  const extension = binary ? 'bin' : 'txt';
  return {
    camerasFile: new File([binary ? writeCamerasBinary(original.cameras) : writeCamerasText(original.cameras)], `cameras.${extension}`),
    imagesFile: new File([binary ? writeImagesBinary(original.images) : writeImagesText(original.images)], `images.${extension}`),
    points3DFile: new File([binary ? writePoints3DBinary(original.points3D!) : writePoints3DText(original.points3D!)], `points3D.${extension}`),
    rigsFile: new File([binary ? writeRigsBinary(original.rigData!.rigs) : writeRigsText(original.rigData!.rigs)], `rigs.${extension}`),
    framesFile: new File([binary ? writeFramesBinary(original.rigData!.frames) : writeFramesText(original.rigData!.frames)], `frames.${extension}`),
  };
}

const owners: ReconstructionAuthority[] = [];
function owner() { const value = new ReconstructionAuthority(); owners.push(value); return value; }
afterEach(() => { owners.splice(0).forEach(value => value.dispose()); vi.restoreAllMocks(); });
async function execute<K extends ReconstructionOperation>(authority: ReconstructionAuthority, operation: K, payload: ReconstructionOperationPayloads[K]): Promise<ReconstructionOperationResults[K]> {
  return await authority.execute({ generation: 1, requestId: 1, operation, payload } as ReconstructionRequest, () => undefined) as ReconstructionOperationResults[K];
}

describe.each(['text', 'binary'] as const)('reconstruction authority %s parity', format => {
  it.skipIf(format === 'binary' && !existsSync(resolve('public/wasm/colmap_wasm.wasm')))('keeps observations/records in its owner while transferring stable render data, IDs, statistics and rigs', async () => {
    const authority = owner();
    const snapshot = await execute(authority, 'load', files(format));
    expect(snapshot.diagnostics.parser).toBe(format === 'binary' ? 'wasm' : 'javascript');
    expect(snapshot.reconstruction.points3D).toBeUndefined();
    expect([...snapshot.reconstruction.images.values()].every(image => image.points2D.length === 0 && image.numPoints2D === 3)).toBe(true);
    expect(snapshot.point3DIds).toEqual(new BigUint64Array([73n, pointId]));
    expect(snapshot.reconstruction.imageStats).toEqual(computeImageStats(original.images, original.points3D!).imageStats);
    expect(snapshot.reconstruction.imageToPoint3DIds.size).toBe(0);
    expect(new Set(createPointMembershipViews(snapshot.pointMembership!).get(7))).toEqual(new Set([pointId, 73n]));
    expect(snapshot.diagnostics.membershipBytes).toBe(60);
    expect(snapshot.diagnostics.membershipPackMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.reconstruction.connectedImagesIndex.get(7)?.get(42)).toBe(2);
    expect(snapshot.reconstruction.rigData).toEqual(original.rigData);

    const copied = structuredClone(snapshot, { transfer: reconstructionResultTransfers(snapshot) });
    expect(snapshot.positions.byteLength).toBe(0);
    expect(snapshot.pointMembership!.pointIds.byteLength).toBe(0);
    expect([...copied.positions]).toEqual([2, 3, 4, 1, 2, 3]);
    expect(new Set(createPointMembershipViews(copied.pointMembership!).get(42))).toEqual(new Set([pointId, 73n]));
    const observations = await execute(authority, 'observations', { imageIds: [7, 42] });
    expect(observations.get(7)).toEqual(images[0].points2D);
    const exported = await execute(authority, 'export', { format: 'binary' });
    expect(parseImagesBinary(exported['images.bin'].buffer as ArrayBuffer).get(7)?.points2D).toEqual(images[0].points2D);
    expect(parsePoints3DBinary(exported['points3D.bin'].buffer as ArrayBuffer)).toEqual(original.points3D);
  });

  it('preserves export fidelity through transform, deletion, camera conversion, and all export formats', async () => {
    const authority = owner();
    await execute(authority, 'load', files(format));
    const previewExport = await execute(authority, 'export', { format: 'binary', transform: { ...createIdentityEuler(), scale: 2, translationX: 5 } });
    expect(parsePoints3DBinary(previewExport['points3D.bin'].buffer as ArrayBuffer).get(pointId)?.xyz).toEqual([7, 4, 6]);
    const transformed = await execute(authority, 'transform', { transform: { ...createIdentityEuler(), scale: 2, translationX: 5 } });
    const pointIndex = [...transformed.point3DIds].indexOf(pointId);
    expect(transformed.positions.slice(pointIndex * 3, pointIndex * 3 + 3)).toEqual(new Float32Array([7, 4, 6]));
    expect(transformed.reconstruction.points3D).toBeUndefined();
    const deleted = await execute(authority, 'deleteImages', { imageIds: [42] });
    expect(deleted.reconstruction.images.has(42)).toBe(false);
    expect(deleted.trackLengths).toEqual(new Uint32Array([1, 1]));
    expect(createPointMembershipViews(deleted.pointMembership!).has(42)).toBe(false);
    expect(new Set(createPointMembershipViews(deleted.pointMembership!).get(7))).toEqual(new Set([pointId, 73n]));
    expect(deleted.reconstruction.globalStats.totalObservations).toBe(2);
    expect(deleted.reconstruction.rigData?.frames.has(42)).toBe(false);
    const converted = { ...camera, modelId: CameraModelId.SIMPLE_PINHOLE, params: [500, 320, 240] };
    await execute(authority, 'updateCameras', { cameras: new Map([[9, converted]]) });
    const exported = await execute(authority, 'export', { format: 'binary' });
    expect(parseCamerasBinary(exported['cameras.bin'].buffer as ArrayBuffer).get(9)).toEqual(converted);
    const exportedImages = parseImagesBinary(exported['images.bin'].buffer as ArrayBuffer);
    const exportedPoints = parsePoints3DBinary(exported['points3D.bin'].buffer as ArrayBuffer);
    for (const point of exportedPoints.values()) for (const track of point.track) {
      expect(exportedImages.get(track.imageId)?.points2D[track.point2DIdx].point3DId).toBe(point.point3DId);
    }
    expect(parseFramesBinary(exported['frames.bin'].buffer as ArrayBuffer).get(7)?.rigFromWorld.tvec).toEqual([-5, 0, 0]);
    const text = await execute(authority, 'export', { format: 'text' });
    expect(parseImagesText(new TextDecoder().decode(text['images.txt'])).get(7)?.points2D).toEqual(images[0].points2D);
    expect(new TextDecoder().decode((await execute(authority, 'export', { format: 'ply' }))['points.ply'])).toContain('element vertex 2');
  });
});

it('rejects malformed data and releases the owner on disposal', async () => {
  const authority = owner();
  const invalid = files('text');
  invalid.camerasFile = new File([new Uint8Array(2)], 'cameras.bin');
  await expect(execute(authority, 'load', invalid)).rejects.toThrow();
  authority.dispose();
  await expect(execute(authority, 'observations', { imageIds: [7] })).rejects.toThrow('no loaded dataset');
});
