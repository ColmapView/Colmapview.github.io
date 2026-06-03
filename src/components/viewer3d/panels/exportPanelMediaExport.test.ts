import { describe, expect, it, vi } from 'vitest';
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
    downloadImagesZip: vi.fn(async (_names, _fetchImage, _options, onProgress) => {
      onProgress(50);
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
    downloadMasksZip: vi.fn(async (_names, _fetchMask, onProgress) => {
      onProgress(75);
    }),
    setProgress: vi.fn(),
    addNotification: vi.fn(),
    logError: vi.fn(),
    ...overrides,
  };
}

describe('export panel media export helpers', () => {
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
      deps.setProgress
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
      deps.setProgress
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
