import { describe, expect, it, vi } from 'vitest';
import {
  buildCamera,
  buildFile,
  buildGlobalStats,
  buildImage,
  buildImageStats,
  buildPoint3D,
  buildRigData,
  buildWasmReconstructionWrapper,
} from '../test/builders';
import type { RigData } from '../types/rig';
import {
  buildColmapReconstruction,
  getColmapPointCount,
} from './fileDropzoneReconstruction';

function createStatsResult(imageId = 1) {
  const connectedImagesIndex = new Map([[imageId, new Map([[2, 1]])]]);
  const imageToPoint3DIds = new Map([[imageId, new Set([1n, 2n])]]);

  return {
    imageStats: new Map([[imageId, buildImageStats({ numPoints3D: 3 })]]),
    connectedImagesIndex,
    globalStats: buildGlobalStats({ totalPoints: 7 }),
    imageToPoint3DIds,
  };
}

function createStatsComputers(stats = createStatsResult()) {
  return {
    computeImageStats: vi.fn(() => stats),
    computeImageStatsFromWasm: vi.fn(() => stats),
  };
}

function createRigData(): RigData {
  return buildRigData({ rigs: [], frames: [] });
}

describe('file dropzone reconstruction builder', () => {
  it('builds JS-parser reconstructions with a points3D map and optional rig data', async () => {
    const camera = buildCamera();
    const image = buildImage({ imageId: 7, cameraId: camera.cameraId });
    const point = buildPoint3D({ point3DId: 9n });
    const cameras = new Map([[camera.cameraId, camera]]);
    const images = new Map([[image.imageId, image]]);
    const points3D = new Map([[point.point3DId, point]]);
    const stats = createStatsResult(image.imageId);
    const statsComputers = createStatsComputers(stats);
    const rigData = createRigData();
    const loadRigData = vi.fn(async () => rigData);
    const afterStatsComputed = vi.fn();
    const rigsFile = buildFile('rigs.txt');
    const framesFile = buildFile('frames.txt');

    const result = await buildColmapReconstruction({
      parseResult: {
        cameras,
        images,
        points3D,
        wasmWrapper: null,
        usedWasmPath: false,
      },
      rigsFile,
      framesFile,
      statsComputers,
      loadRigData,
      afterStatsComputed,
    });

    expect(statsComputers.computeImageStats).toHaveBeenCalledWith(images, points3D);
    expect(statsComputers.computeImageStatsFromWasm).not.toHaveBeenCalled();
    expect(afterStatsComputed.mock.invocationCallOrder[0]).toBeLessThan(
      loadRigData.mock.invocationCallOrder[0]
    );
    expect(loadRigData).toHaveBeenCalledWith({ wasmRigData: undefined, rigsFile, framesFile });
    expect(result.pointCount).toBe(1);
    expect(result.reconstruction).toMatchObject({
      cameras,
      images,
      points3D,
      imageStats: stats.imageStats,
      connectedImagesIndex: stats.connectedImagesIndex,
      globalStats: stats.globalStats,
      imageToPoint3DIds: stats.imageToPoint3DIds,
      rigData,
    });
  });

  it('builds WASM-parser reconstructions without materializing a points3D map', async () => {
    const camera = buildCamera();
    const image = buildImage({ cameraId: camera.cameraId });
    const cameras = new Map([[camera.cameraId, camera]]);
    const images = new Map([[image.imageId, image]]);
    const wasmRigData = createRigData();
    const stats = createStatsResult(image.imageId);
    const statsComputers = createStatsComputers(stats);
    const wasmWrapper = buildWasmReconstructionWrapper({ pointCount: 42 });
    const loadRigData = vi.fn(async () => wasmRigData);

    const result = await buildColmapReconstruction({
      parseResult: {
        cameras,
        images,
        wasmRigData,
        wasmWrapper,
        usedWasmPath: true,
      },
      statsComputers,
      loadRigData,
    });

    expect(statsComputers.computeImageStatsFromWasm).toHaveBeenCalledWith(images, wasmWrapper);
    expect(statsComputers.computeImageStats).not.toHaveBeenCalled();
    expect(loadRigData).toHaveBeenCalledWith({
      wasmRigData,
      rigsFile: undefined,
      framesFile: undefined,
    });
    expect(result.pointCount).toBe(42);
    expect(result.reconstruction.points3D).toBeUndefined();
    expect(result.reconstruction.rigData).toBe(wasmRigData);
  });

  it('fails fast if a JS-parser result has no points3D map for stats computation', async () => {
    const camera = buildCamera();
    const image = buildImage({ cameraId: camera.cameraId });

    await expect(buildColmapReconstruction({
      parseResult: {
        cameras: new Map([[camera.cameraId, camera]]),
        images: new Map([[image.imageId, image]]),
        wasmWrapper: null,
        usedWasmPath: false,
      },
      statsComputers: createStatsComputers(),
      loadRigData: vi.fn(),
    })).rejects.toThrow('COLMAP parser returned no points3D map for JS stats computation');
  });

  it('derives point counts from WASM first, then JS points, then zero', () => {
    expect(getColmapPointCount({
      wasmWrapper: buildWasmReconstructionWrapper({ pointCount: 5 }),
      points3D: new Map([[1n, buildPoint3D()]]),
    })).toBe(5);

    expect(getColmapPointCount({
      wasmWrapper: null,
      points3D: new Map([[1n, buildPoint3D()], [2n, buildPoint3D({ point3DId: 2n })]]),
    })).toBe(2);

    expect(getColmapPointCount({
      wasmWrapper: null,
      points3D: undefined,
    })).toBe(0);
  });
});
