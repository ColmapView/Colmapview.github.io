import { describe, expect, it, vi } from 'vitest';
import type { Reconstruction } from '../types/colmap';
import { noopLogger, type AppLogger } from '../utils/logger';
import type { FileDropzoneWorkflowDeps } from './fileDropzoneWorkflow';
import { processFileDropzoneFiles } from './fileDropzoneWorkflow';

function file(name: string): File {
  return new File([''], name);
}

function loadedFiles(overrides: Partial<NonNullable<ReturnType<FileDropzoneWorkflowDeps['getLoadedFiles']>>> = {}) {
  return {
    camerasFile: file('cameras.bin'),
    imagesFile: file('images.bin'),
    points3DFile: file('points3D.bin'),
    splatFile: undefined,
    databaseFile: undefined,
    rigsFile: undefined,
    framesFile: undefined,
    imageFiles: new Map<string, File>(),
    hasMasks: false,
    ...overrides,
  };
}

function createLogger(): AppLogger {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

function createReconstruction(): Reconstruction {
  return {
    cameras: new Map(),
    images: new Map([
      [1, {
        imageId: 1,
        cameraId: 1,
        name: 'image.jpg',
        qvec: [1, 0, 0, 0],
        tvec: [0, 0, 0],
        points2D: [],
      }],
    ]),
    imageStats: new Map(),
    connectedImagesIndex: new Map(),
    globalStats: {
      avgError: 0,
      avgTrackLength: 0,
      maxError: 0,
      maxTrackLength: 0,
      minError: 0,
      minTrackLength: 0,
      totalObservations: 0,
      totalPoints: 0,
    },
    imageToPoint3DIds: new Map(),
  };
}

function createDeps(overrides: Partial<FileDropzoneWorkflowDeps> = {}): FileDropzoneWorkflowDeps {
  return {
    addNotification: vi.fn(),
    clearSplatPsnr: vi.fn(),
    clearCaches: vi.fn(),
    delay: vi.fn(async () => undefined),
    getFailedImageCount: vi.fn(() => 0),
    getLoadedFiles: vi.fn(() => null),
    getMinTrackLength: vi.fn(() => 1),
    getSourceInfo: vi.fn(() => ({ imageUrlBase: null, sourceType: 'local' })),
    getUrlLoading: vi.fn(() => false),
    logger: noopLogger,
    resetView: vi.fn(),
    preloadSplatRuntime: vi.fn(async () => undefined),
    setDroppedFiles: vi.fn(),
    setError: vi.fn(),
    setLoadedFiles: vi.fn(),
    setReconstruction: vi.fn(),
    setUrlLoading: vi.fn(),
    setUrlProgress: vi.fn(),
    setWasmReconstruction: vi.fn(),
    ...overrides,
  };
}

describe('file dropzone workflow', () => {
  it('applies config-only drops without entering reconstruction parsing', async () => {
    const importConfig = vi.fn(async () => ({ applied: false, errorMessage: 'Config error: invalid' }));
    const parseFiles = vi.fn();
    const deps = createDeps({ importConfig, parseFiles });

    const result = await processFileDropzoneFiles(new Map([['viewer.yaml', file('viewer.yaml')]]), deps);

    expect(result).toBe(false);
    expect(importConfig).toHaveBeenCalledWith(expect.any(File), { logErrors: true });
    expect(deps.setError).toHaveBeenCalledWith('Config error: invalid');
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
    expect(deps.setDroppedFiles).not.toHaveBeenCalled();
    expect(parseFiles).not.toHaveBeenCalled();
  });

  it('runs COLMAP parsing through injected workflow dependencies', async () => {
    const logger = createLogger();
    const reconstruction = createReconstruction();
    const parseResult = {
      cameras: new Map(),
      images: reconstruction.images,
      points3D: new Map(),
      wasmWrapper: null,
      usedWasmPath: false,
    };
    const parseFiles = vi.fn(async () => parseResult);
    const buildReconstruction = vi.fn(async ({ afterStatsComputed }) => {
      afterStatsComputed?.();
      return { reconstruction, pointCount: 1 };
    });
    const deps = createDeps({
      buildReconstruction,
      getSourceInfo: vi.fn(() => ({ imageUrlBase: null, sourceType: 'local' })),
      logger,
      parseFiles,
    });
    const files = new Map([
      ['sparse/0/cameras.bin', file('cameras.bin')],
      ['sparse/0/images.bin', file('images.bin')],
      ['sparse/0/points3D.bin', file('points3D.bin')],
      ['splats/small.ply', new File(['x'], 'small.ply')],
      ['splats/large.ply', new File(['xxxx'], 'large.ply')],
      ['splats/model.spz', new File(['xx'], 'model.spz')],
      ['images/image.jpg', file('image.jpg')],
    ]);

    const result = await processFileDropzoneFiles(files, deps, { start: 80, end: 100 });

    expect(result).toBe(true);
    expect(parseFiles).toHaveBeenCalledWith(expect.objectContaining({
      camerasFile: expect.any(File),
      imagesFile: expect.any(File),
      points3DFile: expect.any(File),
      addNotification: deps.addNotification,
      log: logger.info,
    }));
    expect(buildReconstruction).toHaveBeenCalledWith(expect.objectContaining({
      parseResult,
    }));
    expect(deps.preloadSplatRuntime).toHaveBeenCalledTimes(1);
    expect(deps.clearSplatPsnr).toHaveBeenCalledTimes(1);
    expect(deps.setLoadedFiles).toHaveBeenCalledWith(expect.objectContaining({
      splatFile: expect.objectContaining({ name: 'model.spz' }),
      splatFiles: [
        expect.objectContaining({ name: 'model.spz' }),
        expect.objectContaining({ name: 'large.ply' }),
        expect.objectContaining({ name: 'small.ply' }),
      ],
    }));
    expect(deps.clearCaches).toHaveBeenCalledWith({ preserveZip: true });
    expect(deps.setReconstruction).toHaveBeenCalledWith(reconstruction);
    expect(deps.resetView).toHaveBeenCalled();
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('updates the current splat file for PLY-only drops after reconstruction load', async () => {
    const logger = createLogger();
    const oldSplat = new File(['x'], 'old.ply');
    const smallSplat = new File(['xx'], 'small.ply');
    const largestSplat = new File(['xxxx'], 'replacement.ply');
    const currentLoadedFiles = loadedFiles({ splatFile: oldSplat });
    const parseFiles = vi.fn();
    const deps = createDeps({
      getLoadedFiles: vi.fn(() => currentLoadedFiles),
      logger,
      parseFiles,
    });
    const files = new Map([
      ['output/small.ply', smallSplat],
      ['folder/folder/folder/replacement.ply', largestSplat],
    ]);

    const result = await processFileDropzoneFiles(files, deps);

    expect(result).toBe(true);
    expect(deps.preloadSplatRuntime).toHaveBeenCalledTimes(1);
    expect(deps.clearSplatPsnr).toHaveBeenCalledTimes(1);
    expect(deps.setLoadedFiles).toHaveBeenCalledWith({
      ...currentLoadedFiles,
      splatFile: largestSplat,
      splatFiles: [largestSplat, smallSplat],
    });
    expect(deps.setUrlProgress).toHaveBeenCalledWith({
      percent: 100,
      message: 'Splat file updated',
      currentFile: 'replacement.ply',
    });
    expect(deps.addNotification).toHaveBeenCalledWith(
      'info',
      'Updated splat file: replacement.ply',
      4000
    );
    expect(deps.setDroppedFiles).not.toHaveBeenCalled();
    expect(parseFiles).not.toHaveBeenCalled();
    expect(deps.setReconstruction).not.toHaveBeenCalled();
    expect(deps.resetView).not.toHaveBeenCalled();
    expect(deps.setError).not.toHaveBeenCalled();
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
    expect(logger.info).toHaveBeenCalledWith('[Splats] Updated splat file: replacement.ply');
  });

  it('keeps rejecting PLY-only drops when no dataset is loaded', async () => {
    const logger = createLogger();
    const parseFiles = vi.fn();
    const deps = createDeps({
      getLoadedFiles: vi.fn(() => null),
      logger,
      parseFiles,
    });

    const result = await processFileDropzoneFiles(new Map([
      ['model.ply', new File(['xxxx'], 'model.ply')],
    ]), deps);

    expect(result).toBe(false);
    expect(deps.setLoadedFiles).not.toHaveBeenCalled();
    expect(deps.setDroppedFiles).not.toHaveBeenCalled();
    expect(parseFiles).not.toHaveBeenCalled();
    expect(deps.setError).toHaveBeenCalledWith(
      'Missing required COLMAP files. Expected cameras.bin/txt, images.bin/txt, and points3D.bin/txt'
    );
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
  });

  it('throws processing errors for URL-loader style calls that request propagation', async () => {
    const error = new Error('parse failed');
    const deps = createDeps({
      parseFiles: vi.fn(async () => {
        throw error;
      }),
    });
    const files = new Map([
      ['sparse/0/cameras.bin', file('cameras.bin')],
      ['sparse/0/images.bin', file('images.bin')],
      ['sparse/0/points3D.bin', file('points3D.bin')],
    ]);

    await expect(processFileDropzoneFiles(files, deps, {
      progressRange: { start: 80, end: 100 },
      throwOnError: true,
    })).rejects.toBe(error);

    expect(deps.setError).toHaveBeenCalledWith('parse failed');
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
  });

  it('throws config-only failures when propagation is requested', async () => {
    const importConfig = vi.fn(async () => ({ applied: false, errorMessage: 'Config error: invalid' }));
    const deps = createDeps({ importConfig });

    await expect(processFileDropzoneFiles(new Map([['viewer.yaml', file('viewer.yaml')]]), deps, {
      throwOnError: true,
    })).rejects.toThrow('Config error: invalid');

    expect(deps.setError).toHaveBeenCalledWith('Config error: invalid');
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
  });
});
