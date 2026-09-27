import { describe, expect, it, vi } from 'vitest';
import { MediaZipPathConflictError } from '../../../parsers/mediaZipExport';
import {
  runImageZipExport,
  runMaskZipExport,
  type RunImageZipExportDeps,
  type RunMaskZipExportDeps,
} from './exportPanelMediaExport';

function createImageDeps(
  overrides: Partial<RunImageZipExportDeps> = {}
): RunImageZipExportDeps {
  return {
    fetchImage: vi.fn(async () => null),
    downloadImagesZip: vi.fn(async (names, _fetchImage, _options, onProgress) => {
      onProgress(50);
      return { total: names.length, exported: names.length, failed: 0 };
    }),
    setProgress: vi.fn(),
    addNotification: vi.fn(),
    logError: vi.fn(),
    ...overrides,
  };
}

function createMaskDeps(
  overrides: Partial<RunMaskZipExportDeps> = {}
): RunMaskZipExportDeps {
  return {
    fetchMask: vi.fn(async () => null),
    downloadMasksZip: vi.fn(async (names, _fetchMask, onProgress) => {
      onProgress(75);
      return { total: names.length, exported: names.length, failed: 0 };
    }),
    setProgress: vi.fn(),
    addNotification: vi.fn(),
    logError: vi.fn(),
    ...overrides,
  };
}

describe('export panel media export helpers', () => {
  it.each(['resolve', 'reject'] as const)('does not report success or failure when cancelled exports %s late', async outcome => {
    const controller = new AbortController();
    const deps = createImageDeps({ downloadImagesZip: vi.fn(async () => {
      controller.abort();
      if (outcome === 'reject') throw new DOMException('Aborted', 'AbortError');
      return { total: 1, exported: 1, failed: 0 };
    }) });
    await runImageZipExport({ imageNames: ['a.jpg'], jpegQualityPercent: 100, signal: controller.signal }, deps);
    expect(deps.addNotification).not.toHaveBeenCalled();
    expect(deps.logError).not.toHaveBeenCalled();
    expect(deps.setProgress).toHaveBeenLastCalledWith(null);
    expect(deps.downloadImagesZip).toHaveBeenCalledWith(['a.jpg'], deps.fetchImage, { jpegQuality: 1 }, deps.setProgress, controller.signal);
  });

  it('explains image ZIP path conflicts and clears progress', async () => {
    const error = new MediaZipPathConflictError('images/photo.jpg');
    const deps = createImageDeps({ downloadImagesZip: vi.fn().mockRejectedValue(error) });

    await runImageZipExport({ imageNames: ['photo.png', 'photo.jpg'], jpegQualityPercent: 85 }, deps);

    expect(deps.addNotification).toHaveBeenCalledExactlyOnceWith('warning', error.message);
    expect(deps.setProgress).toHaveBeenLastCalledWith(null);
  });

  it('explains mask ZIP path conflicts and clears progress', async () => {
    const error = new MediaZipPathConflictError('masks/photo.jpg.png');
    const deps = createMaskDeps({ downloadMasksZip: vi.fn().mockRejectedValue(error) });

    await runMaskZipExport({ imageNames: ['photo.jpg', 'images/photo.jpg'] }, deps);

    expect(deps.addNotification).toHaveBeenCalledExactlyOnceWith('warning', error.message);
    expect(deps.setProgress).toHaveBeenLastCalledWith(null);
  });

  it.each([
    [1, 'Exported 1 of 3 images; 2 could not be exported.'],
    [0, 'No images could be exported.'],
  ])('reports incomplete image exports with %i successful files', async (exported, message) => {
    const deps = createImageDeps({
      downloadImagesZip: vi.fn(async () => ({ total: 3, exported, failed: 3 - exported })),
    });

    await runImageZipExport({ imageNames: ['a.jpg', 'b.jpg', 'c.jpg'], jpegQualityPercent: 85 }, deps);

    expect(deps.addNotification).toHaveBeenCalledExactlyOnceWith('warning', message);
    expect(deps.setProgress).toHaveBeenLastCalledWith(null);
  });

  it.each([
    [1, 'Exported 1 of 3 masks; 2 could not be exported.'],
    [0, 'No masks could be exported.'],
  ])('reports incomplete mask exports with %i successful files', async (exported, message) => {
    const deps = createMaskDeps({
      downloadMasksZip: vi.fn(async () => ({ total: 3, exported, failed: 3 - exported })),
    });

    await runMaskZipExport({ imageNames: ['a.jpg', 'b.jpg', 'c.jpg'] }, deps);

    expect(deps.addNotification).toHaveBeenCalledExactlyOnceWith('warning', message);
    expect(deps.setProgress).toHaveBeenLastCalledWith(null);
  });

  it('exports images with normalized JPEG quality and progress updates', async () => {
    const deps = createImageDeps();

    await runImageZipExport({
      imageNames: ['a.jpg', 'b.jpg'],
      jpegQualityPercent: 85,
    }, deps);

    expect(deps.downloadImagesZip).toHaveBeenCalledWith(
      ['a.jpg', 'b.jpg'],
      deps.fetchImage,
      { jpegQuality: 0.85 },
      deps.setProgress,
      undefined,
    );
    expect(deps.setProgress).toHaveBeenNthCalledWith(1, 0);
    expect(deps.setProgress).toHaveBeenNthCalledWith(2, 50);
    expect(deps.setProgress).toHaveBeenLastCalledWith(null);
    expect(deps.addNotification).toHaveBeenCalledWith('info', 'Images exported successfully');
  });

  it('skips image export when there are no images', async () => {
    const deps = createImageDeps();

    await runImageZipExport({
      imageNames: [],
      jpegQualityPercent: 85,
    }, deps);

    expect(deps.downloadImagesZip).not.toHaveBeenCalled();
    expect(deps.setProgress).not.toHaveBeenCalled();
  });

  it('reports image export failures and clears progress', async () => {
    const error = new Error('image zip failed');
    const deps = createImageDeps({
      downloadImagesZip: vi.fn(async () => {
        throw error;
      }),
    });

    await runImageZipExport({
      imageNames: ['a.jpg'],
      jpegQualityPercent: 90,
    }, deps);

    expect(deps.logError).toHaveBeenCalledWith('Image export failed:', error);
    expect(deps.addNotification).toHaveBeenCalledWith('warning', 'Image export failed');
    expect(deps.setProgress).toHaveBeenLastCalledWith(null);
  });

  it('exports masks with progress updates', async () => {
    const deps = createMaskDeps();

    await runMaskZipExport({ imageNames: ['a.jpg'] }, deps);

    expect(deps.downloadMasksZip).toHaveBeenCalledWith(
      ['a.jpg'],
      deps.fetchMask,
      deps.setProgress,
      undefined,
    );
    expect(deps.setProgress).toHaveBeenNthCalledWith(1, 0);
    expect(deps.setProgress).toHaveBeenNthCalledWith(2, 75);
    expect(deps.setProgress).toHaveBeenLastCalledWith(null);
    expect(deps.addNotification).toHaveBeenCalledWith('info', 'Masks exported successfully');
  });

  it('skips mask export when there are no images', async () => {
    const deps = createMaskDeps();

    await runMaskZipExport({ imageNames: [] }, deps);

    expect(deps.downloadMasksZip).not.toHaveBeenCalled();
    expect(deps.setProgress).not.toHaveBeenCalled();
  });

  it('reports mask export failures and clears progress', async () => {
    const error = new Error('mask zip failed');
    const deps = createMaskDeps({
      downloadMasksZip: vi.fn(async () => {
        throw error;
      }),
    });

    await runMaskZipExport({ imageNames: ['a.jpg'] }, deps);

    expect(deps.logError).toHaveBeenCalledWith('Mask export failed:', error);
    expect(deps.addNotification).toHaveBeenCalledWith('warning', 'Mask export failed');
    expect(deps.setProgress).toHaveBeenLastCalledWith(null);
  });
});
