import { describe, expect, it, vi } from 'vitest';
import {
  buildBinaryFile,
  buildCamera,
  buildImage,
  buildPoint3D,
  buildRigData,
  buildTextFile,
  buildWasmReconstructionWrapper,
} from '../test/builders';
import {
  parseColmapFiles,
  type ColmapParserDeps,
  type ColmapParserFiles,
} from './fileDropzoneColmapParser';

function textFile(name: string, contents: string): File {
  return buildTextFile(name, contents);
}

function binaryFile(name: string, contents: string): File {
  return buildBinaryFile(name, contents);
}

function createFiles({
  camerasFile = textFile('cameras.txt', 'camera text'),
  imagesFile = textFile('images.txt', 'image text'),
  points3DFile = textFile('points3D.txt', 'point text'),
}: Partial<ColmapParserFiles> = {}): ColmapParserFiles {
  return { camerasFile, imagesFile, points3DFile };
}

function createParserDeps() {
  const camera = buildCamera({ cameraId: 1 });
  const image = buildImage({ imageId: 2, cameraId: camera.cameraId });
  const point = buildPoint3D({ point3DId: 3n });
  const cameras = new Map([[camera.cameraId, camera]]);
  const images = new Map([[image.imageId, image]]);
  const points3D = new Map([[point.point3DId, point]]);
  const parsers: ColmapParserDeps = {
    parseWithWasm: vi.fn().mockResolvedValue(null),
    parseCamerasBinary: vi.fn(() => cameras),
    parseCamerasText: vi.fn(() => cameras),
    parseImagesBinary: vi.fn(() => images),
    parseImagesText: vi.fn(() => images),
    parsePoints3DBinary: vi.fn(() => points3D),
    parsePoints3DText: vi.fn(() => points3D),
  };

  return { parsers, cameras, images, points3D };
}

describe('file dropzone COLMAP parser helper', () => {
  it('uses the WASM parser result when available', async () => {
    const { parsers } = createParserDeps();
    const camera = buildCamera({ cameraId: 10 });
    const image = buildImage({ imageId: 20, cameraId: camera.cameraId });
    const cameras = new Map([[camera.cameraId, camera]]);
    const images = new Map([[image.imageId, image]]);
    const rigData = buildRigData();
    const wasmWrapper = buildWasmReconstructionWrapper({ pointCount: 1234 });
    vi.mocked(parsers.parseWithWasm).mockResolvedValue({
      cameras,
      images,
      rigData,
      wasmWrapper,
    });
    const addNotification = vi.fn();
    const log = vi.fn();

    await expect(parseColmapFiles({
      ...createFiles({
        camerasFile: binaryFile('cameras.bin', 'camera bytes'),
        imagesFile: binaryFile('images.bin', 'image bytes'),
        points3DFile: binaryFile('points3D.bin', 'point bytes'),
      }),
      parsers,
      addNotification,
      log,
    })).resolves.toEqual({
      cameras,
      images,
      wasmRigData: rigData,
      wasmWrapper,
      usedWasmPath: true,
    });

    expect(addNotification).toHaveBeenCalledWith('info', 'Loaded 1,234 points', 5000);
    expect(parsers.parseCamerasBinary).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('[Parser] Attempting WASM parser (memory-optimized)...');
  });

  it('falls back to text JS parsers when WASM returns null', async () => {
    const { parsers, cameras, images, points3D } = createParserDeps();
    const addNotification = vi.fn();

    await expect(parseColmapFiles({
      ...createFiles(),
      parsers,
      addNotification,
      log: vi.fn(),
    })).resolves.toEqual({
      cameras,
      images,
      points3D,
      wasmWrapper: null,
      usedWasmPath: false,
    });

    expect(parsers.parseCamerasText).toHaveBeenCalledWith('camera text');
    expect(parsers.parseImagesText).toHaveBeenCalledWith('image text');
    expect(parsers.parsePoints3DText).toHaveBeenCalledWith('point text');
    expect(addNotification).not.toHaveBeenCalled();
  });

  it('routes binary JS parsing through lite image parsing and notifies about 2D points', async () => {
    const { parsers } = createParserDeps();
    const addNotification = vi.fn();

    await parseColmapFiles({
      ...createFiles({
        camerasFile: binaryFile('cameras.bin', 'camera bytes'),
        imagesFile: binaryFile('images.bin', 'image bytes'),
        points3DFile: binaryFile('points3D.bin', 'point bytes'),
      }),
      parsers,
      addNotification,
      log: vi.fn(),
    });

    expect(vi.mocked(parsers.parseCamerasBinary).mock.calls[0][0].byteLength).toBeGreaterThan(0);
    expect(vi.mocked(parsers.parseImagesBinary).mock.calls[0][1]).toBe(true);
    expect(vi.mocked(parsers.parsePoints3DBinary).mock.calls[0][0].byteLength).toBeGreaterThan(0);
    expect(addNotification).toHaveBeenCalledWith(
      'info',
      '2D point data not loaded. Keypoint overlay may be limited.',
      5000
    );
  });
});
