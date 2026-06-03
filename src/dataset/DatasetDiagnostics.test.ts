import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetDiagnostics, type DatasetDiagnosticsState } from './DatasetDiagnostics';
import type { LoadedFiles, Reconstruction } from '../types/colmap';
import { buildCamera, buildImage, buildPoint2D, buildPoint3D, buildReconstruction } from '../test/builders';

vi.mock('../utils/imageFileUtils', () => ({
  getLocalImageStats: vi.fn(),
}));

vi.mock('../utils/urlImageFiles', () => ({
  getUrlImageCacheStats: vi.fn(),
}));

vi.mock('../utils/zipImageFiles', () => ({
  getZipImageCacheStats: vi.fn(),
  getZipMaskCacheStats: vi.fn(),
}));

import { getLocalImageStats } from '../utils/imageFileUtils';
import { getUrlImageCacheStats } from '../utils/urlImageFiles';
import { getZipImageCacheStats, getZipMaskCacheStats } from '../utils/zipImageFiles';

describe('DatasetDiagnostics', () => {
  let state: DatasetDiagnosticsState;
  let diagnostics: DatasetDiagnostics;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUrlImageCacheStats).mockReturnValue({ count: 0, sizeBytes: 0 });
    vi.mocked(getZipImageCacheStats).mockReturnValue({ count: 0, sizeBytes: 0 });
    vi.mocked(getZipMaskCacheStats).mockReturnValue({ count: 0, sizeBytes: 0 });
    vi.mocked(getLocalImageStats).mockReturnValue({ count: 0, sizeBytes: 0 });

    state = {
      sourceType: null,
      imageUrlBase: null,
      maskUrlBase: null,
      loadedFiles: null,
      reconstruction: null,
      wasmReconstruction: null,
    };

    diagnostics = new DatasetDiagnostics(() => state, {
      getThumbnailCacheStats: vi.fn(() => ({ count: 0, loading: 0, pending: 0 })),
      getFrustumTextureCacheStats: vi.fn(() => ({ urlCache: { count: 0, loading: 0, pending: 0 }, textures: 0, bitmaps: 0 })),
      getActiveZipStats: vi.fn(() => ({ fileSize: 0, imageCount: 0 })),
    });
  });

  it('returns cache stats without requiring dataset access APIs', () => {
    state.sourceType = 'zip';
    vi.mocked(getUrlImageCacheStats).mockReturnValue({ count: 10, sizeBytes: 1024 * 1024 });
    vi.mocked(getZipImageCacheStats).mockReturnValue({ count: 20, sizeBytes: 2 * 1024 * 1024 });
    vi.mocked(getZipMaskCacheStats).mockReturnValue({ count: 5, sizeBytes: 512 * 1024 });
    vi.mocked(getLocalImageStats).mockReturnValue({ count: 50, sizeBytes: 5 * 1024 * 1024 });

    const stats = diagnostics.getCacheStats();

    expect(stats.sourceType).toBe('zip');
    expect(stats.zipImages.sizeFormatted).toBe('2.00 MB');
    expect(stats.total.count).toBe(85);
    expect(stats.total.sizeBytes).toBe(1024 * 1024 + 2 * 1024 * 1024 + 512 * 1024 + 5 * 1024 * 1024);
  });

  it('builds memory stats from reconstruction, source, and cache readers', () => {
    const reconstruction = buildDiagnosticsReconstruction();
    state.sourceType = 'local';
    state.loadedFiles = buildLoadedFiles();
    state.reconstruction = reconstruction;
    vi.mocked(getLocalImageStats).mockReturnValue({ count: 2, sizeBytes: 3000 });

    diagnostics = new DatasetDiagnostics(() => state, {
      getThumbnailCacheStats: vi.fn(() => ({ count: 2, loading: 0, pending: 0 })),
      getFrustumTextureCacheStats: vi.fn(() => ({ urlCache: { count: 1, loading: 0, pending: 0 }, textures: 1, bitmaps: 1 })),
      getActiveZipStats: vi.fn(() => ({ fileSize: 0, imageCount: 0 })),
    });

    const stats = diagnostics.getMemoryStats();

    expect(stats.points3D.memory).toMatchObject({ count: 1, sizeBytes: 80 });
    expect(stats.points2D.memory).toMatchObject({ count: 5, sizeBytes: 80 });
    expect(stats.matches.memory).toMatchObject({ count: 9, sizeBytes: 108 });
    expect(stats.cameras.memory).toMatchObject({ count: 2, sizeBytes: 400 });
    expect(stats.imagePoses.memory).toMatchObject({ count: 2, sizeBytes: 400 });
    expect(stats.imageFiles.memory).toMatchObject({ count: 2, sizeBytes: 3000 });
    expect(stats.imageFiles.strategy).toBe('memory');
    expect(stats.imagesDecoded.memory).toMatchObject({ count: 3, sizeBytes: 215000 });
    expect(stats.database.memory).toMatchObject({ count: 1, sizeBytes: 12 });
    expect(stats.rigs.memory).toMatchObject({ count: 1, sizeBytes: 8 });
    expect(stats.splats.memory).toMatchObject({ count: 1, sizeBytes: 9 });
    expect(stats.totalJs.sizeBytes).toBe(80 + 80 + 400 + 400 + 108 + 12 + 8 + 9);
  });
});

function buildDiagnosticsReconstruction(): Reconstruction {
  const cameras = [
    buildCamera({ cameraId: 1 }),
    buildCamera({ cameraId: 2 }),
  ];

  return buildReconstruction({
    cameras,
    images: [
      buildImage({
        imageId: 1,
        cameraId: 1,
        numPoints2D: 3,
      }),
      buildImage({
        imageId: 2,
        cameraId: 2,
        points2D: [buildPoint2D(), buildPoint2D()],
      }),
    ],
    points3D: [buildPoint3D()],
    globalStats: { totalObservations: 9 },
  });
}

function buildLoadedFiles(): LoadedFiles {
  return {
    databaseFile: new File(['database-bin'], 'database.db'),
    rigsFile: new File(['rigs-bin'], 'rigs.bin'),
    splatFile: new File(['splat-bin'], 'scene.ply'),
    imageFiles: new Map([['image.jpg', new File(['image'], 'image.jpg')]]),
    hasMasks: false,
  };
}
