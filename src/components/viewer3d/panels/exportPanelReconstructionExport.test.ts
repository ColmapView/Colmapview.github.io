import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildImage, buildReconstruction } from '../../../test/builders';
import { downloadCameraDatasetPackage } from '../../../parsers/cameraDatasetPackageExport';
import type { Sim3dEuler } from '../../../types/sim3d';
import {
  runReconstructionExport,
  type RunReconstructionExportDeps,
} from './exportPanelReconstructionExport';

vi.mock('../../../parsers/cameraDatasetPackageExport', async importOriginal => ({
  ...await importOriginal<typeof import('../../../parsers/cameraDatasetPackageExport')>(),
  downloadCameraDatasetPackage: vi.fn(),
}));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

const identityTransform: Sim3dEuler = {
  scale: 1,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  translationX: 0,
  translationY: 0,
  translationZ: 0,
};

function createDeps(overrides: Partial<RunReconstructionExportDeps> = {}): RunReconstructionExportDeps {
  const reconstruction = buildReconstruction();

  return {
    getPendingDeletionCount: vi.fn(() => 0),
    confirmPendingDeletions: vi.fn(async () => true),
    applyDeletionsToData: vi.fn(),
    getTransform: vi.fn(() => identityTransform),
    isIdentityTransform: vi.fn(() => true),
    confirmBakeTransform: vi.fn(async () => true),
    getLiveReconstruction: vi.fn(() => ({
      reconstruction,
      wasmReconstruction: null,
    })),
    transformReconstruction: vi.fn(() => reconstruction),
    writers: {
      exportBinary: vi.fn(),
      exportText: vi.fn(),
      exportPly: vi.fn(),
      downloadZip: vi.fn(async () => undefined),
    },
    addNotification: vi.fn(),
    logError: vi.fn(),
    ...overrides,
  };
}

describe('runReconstructionExport', () => {
  it('chooses a destination before async confirmations and exports the current reconstruction after deletions', async () => {
    const original = buildReconstruction(), current = buildReconstruction({ images: [buildImage()] });
    const handle = { name: 'scene.zip', createWritable: vi.fn() } as unknown as FileSystemFileHandle;
    const picker = vi.fn(async () => handle), signal = new AbortController().signal, onProgress = vi.fn();
    vi.stubGlobal('window', { showSaveFilePicker: picker });
    let live = original;
    const deps = createDeps({ getPendingDeletionCount: () => 1,
      getLiveReconstruction: () => ({ reconstruction: live, wasmReconstruction: null }),
      applyDeletionsToData: vi.fn(() => { live = current; }),
      isIdentityTransform: () => false,
    });
    const media = { getOriginalImage: async () => null, getMask: async () => null };
    const pending = runReconstructionExport({ exportFormat: 'zip-images', media, signal, onProgress, saveToFile: true }, deps);
    expect(picker).toHaveBeenCalledOnce();
    expect(deps.confirmPendingDeletions).not.toHaveBeenCalled();
    await pending;
    expect(deps.confirmBakeTransform).toHaveBeenCalledOnce();
    expect(downloadCameraDatasetPackage).toHaveBeenCalledWith(current, null, identityTransform, media, false, signal, onProgress, handle);
    expect(handle.createWritable).not.toHaveBeenCalled(); // Only the actual package writer may open it.
    expect(deps.addNotification).toHaveBeenCalledWith('info', 'Saved scene.zip.', 6000);
  });

  it.each(['deletions', 'transform'] as const)('does not open a chosen destination after declining %s', async stage => {
    const handle = { name: 'scene.zip', createWritable: vi.fn() } as unknown as FileSystemFileHandle;
    vi.stubGlobal('window', { showSaveFilePicker: vi.fn(async () => handle) });
    const deps = createDeps(stage === 'deletions' ? { getPendingDeletionCount: () => 1, confirmPendingDeletions: async () => false }
      : { isIdentityTransform: () => false, confirmBakeTransform: async () => false });
    await runReconstructionExport({ exportFormat: 'zip-images', saveToFile: true,
      media: { getOriginalImage: async () => null, getMask: async () => null } }, deps);
    expect(downloadCameraDatasetPackage).not.toHaveBeenCalled();
    expect(handle.createWritable).not.toHaveBeenCalled();
    expect(deps.addNotification).toHaveBeenCalledWith('info', 'Export cancelled.', 3000);
  });

  it('treats picker dismissal as cancellation without logging an export failure', async () => {
    const picker = vi.fn().mockRejectedValue(new DOMException('Dismissed', 'AbortError'));
    vi.stubGlobal('window', { showSaveFilePicker: picker });
    const deps = createDeps();
    await runReconstructionExport({ exportFormat: 'zip-masks', saveToFile: true,
      media: { getOriginalImage: async () => null, getMask: async () => null } }, deps);
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'colmap-images-masks.zip' }));
    expect(downloadCameraDatasetPackage).not.toHaveBeenCalled(); expect(deps.logError).not.toHaveBeenCalled();
    expect(deps.addNotification).toHaveBeenCalledWith('info', 'Export cancelled.', 3000);
  });

  it('ignores a late native picker after scene replacement', async () => {
    let choose!: (handle: FileSystemFileHandle) => void;
    vi.stubGlobal('window', { showSaveFilePicker: () => new Promise(resolve => { choose = resolve; }) });
    const controller = new AbortController(), deps = createDeps();
    const pending = runReconstructionExport({ exportFormat: 'zip-images', saveToFile: true, signal: controller.signal,
      media: { getOriginalImage: async () => null, getMask: async () => null } }, deps);
    controller.abort(); await pending;
    const createWritable = vi.fn(); choose({ createWritable } as unknown as FileSystemFileHandle);
    await Promise.resolve();
    expect(createWritable).not.toHaveBeenCalled(); expect(downloadCameraDatasetPackage).not.toHaveBeenCalled();
    expect(deps.addNotification).not.toHaveBeenCalled(); expect(deps.logError).not.toHaveBeenCalled();
  });

  it('shows the browser permission failure when a native picker is blocked', async () => {
    const error = new DOMException('Permission denied', 'SecurityError'), deps = createDeps();
    vi.stubGlobal('window', { showSaveFilePicker: vi.fn().mockRejectedValue(error) });
    await runReconstructionExport({ exportFormat: 'zip-images', saveToFile: true,
      media: { getOriginalImage: async () => null, getMask: async () => null } }, deps);
    expect(downloadCameraDatasetPackage).not.toHaveBeenCalled();
    expect(deps.logError).toHaveBeenCalledWith('Export failed:', error);
    expect(deps.addNotification).toHaveBeenCalledWith('warning', 'Export failed: Permission denied');
  });

  it('retains partial-mask warnings when saving to a chosen file', async () => {
    const reconstruction = buildReconstruction({ images: [buildImage({ imageId: 1 }), buildImage({ imageId: 2 })] });
    const deps = createDeps({ getLiveReconstruction: () => ({ reconstruction, wasmReconstruction: null }) });
    vi.stubGlobal('window', { showSaveFilePicker: async () => ({ name: 'masks.zip' }) });
    vi.mocked(downloadCameraDatasetPackage).mockResolvedValueOnce(1);
    await runReconstructionExport({ exportFormat: 'zip-masks', saveToFile: true,
      media: { getOriginalImage: async () => null, getMask: async () => null } }, deps);
    expect(deps.addNotification).toHaveBeenCalledWith('warning', expect.stringMatching(/^Saved masks.zip\. Exported 1 of 2 masks.*COLMAP requires/), 10000);
  });

  it.each(['format', 'media', 'reconstruction'] as const)('does not open a picker without a valid %s', async missing => {
    const picker = vi.fn(); vi.stubGlobal('window', { showSaveFilePicker: picker });
    const deps = createDeps(missing === 'reconstruction' ? { getLiveReconstruction: () => ({ reconstruction: null, wasmReconstruction: null }) } : {});
    await runReconstructionExport({ exportFormat: missing === 'format' ? 'binary' : 'zip-images', saveToFile: true,
      media: missing === 'media' ? undefined : { getOriginalImage: async () => null, getMask: async () => null } }, deps);
    expect(picker).not.toHaveBeenCalled(); expect(downloadCameraDatasetPackage).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])('reports COLMAP mask-folder requirements for partial coverage (%i masks)', async maskCount => {
    const reconstruction = buildReconstruction({ images: [buildImage({ imageId: 1 }), buildImage({ imageId: 2 })] });
    const deps = createDeps({ getLiveReconstruction: () => ({ reconstruction, wasmReconstruction: null }) });
    vi.mocked(downloadCameraDatasetPackage).mockResolvedValueOnce(maskCount);
    await runReconstructionExport({ exportFormat: 'zip-masks', media: { getOriginalImage: async () => null, getMask: async () => null } }, deps);
    if (maskCount === 1) {
      expect(deps.addNotification).toHaveBeenCalledWith('warning', expect.stringMatching(/1 of 2 masks.*COLMAP requires a mask for every image/), expect.any(Number));
    } else {
      expect(deps.addNotification).toHaveBeenCalledWith('info', `Exported ${maskCount} masks for 2 images.`, 6000);
    }
  });
  it('dispatches the selected reconstruction writer', async () => {
    const deps = createDeps();

    await runReconstructionExport({ exportFormat: 'binary' }, deps);
    expect(deps.writers.exportBinary).toHaveBeenCalled();

    await runReconstructionExport({ exportFormat: 'text' }, deps);
    expect(deps.writers.exportText).toHaveBeenCalled();

    await runReconstructionExport({ exportFormat: 'ply' }, deps);
    expect(deps.writers.exportPly).toHaveBeenCalled();
  });

  it('downloads reconstruction ZIP with loaded image files', async () => {
    const deps = createDeps();
    const imageFiles = new Map<string, File>();

    await runReconstructionExport({
      exportFormat: 'zip',
      loadedImageFiles: imageFiles,
    }, deps);

    expect(deps.writers.downloadZip).toHaveBeenCalledWith(
      expect.any(Object),
      { format: 'binary', signal: undefined },
      imageFiles,
      null,
      undefined,
    );
  });

  it('applies pending deletions before reading the live reconstruction', async () => {
    const callOrder: string[] = [];
    const deps = createDeps({
      getPendingDeletionCount: vi.fn(() => 2),
      confirmPendingDeletions: vi.fn(async () => {
        callOrder.push('confirm');
        return true;
      }),
      applyDeletionsToData: vi.fn(() => {
        callOrder.push('apply');
      }),
      getLiveReconstruction: vi.fn(() => {
        callOrder.push('live');
        return { reconstruction: buildReconstruction(), wasmReconstruction: null };
      }),
    });

    await runReconstructionExport({ exportFormat: 'binary' }, deps);

    expect(deps.confirmPendingDeletions).toHaveBeenCalledWith(2);
    expect(callOrder).toEqual(['confirm', 'apply', 'live']);
  });

  it('cancels when pending deletion confirmation is rejected', async () => {
    const deps = createDeps({
      getPendingDeletionCount: vi.fn(() => 1),
      confirmPendingDeletions: vi.fn(async () => false),
    });

    await runReconstructionExport({ exportFormat: 'binary' }, deps);

    expect(deps.applyDeletionsToData).not.toHaveBeenCalled();
    expect(deps.writers.exportBinary).not.toHaveBeenCalled();
    expect(deps.addNotification).toHaveBeenCalledWith('info', 'Export cancelled.', 3000);
  });

  it('confirms and bakes active transforms before export', async () => {
    const transformed = buildReconstruction();
    const deps = createDeps({
      isIdentityTransform: vi.fn(() => false),
      confirmBakeTransform: vi.fn(async () => true),
      transformReconstruction: vi.fn(() => transformed),
    });

    await runReconstructionExport({ exportFormat: 'binary' }, deps);

    expect(deps.confirmBakeTransform).toHaveBeenCalled();
    expect(deps.transformReconstruction).toHaveBeenCalledWith(
      identityTransform,
      expect.any(Object),
      null
    );
    expect(deps.writers.exportBinary).toHaveBeenCalledWith(transformed, null, undefined);
  });

  it('cancels when transform baking is rejected', async () => {
    const deps = createDeps({
      isIdentityTransform: vi.fn(() => false),
      confirmBakeTransform: vi.fn(async () => false),
    });

    await runReconstructionExport({ exportFormat: 'binary' }, deps);

    expect(deps.transformReconstruction).not.toHaveBeenCalled();
    expect(deps.writers.exportBinary).not.toHaveBeenCalled();
    expect(deps.addNotification).toHaveBeenCalledWith('info', 'Export cancelled.', 3000);
  });

  it('reports writer failures without throwing', async () => {
    const error = new Error('writer failed');
    const deps = createDeps({
      writers: {
        exportBinary: vi.fn(() => {
          throw error;
        }),
        exportText: vi.fn(),
        exportPly: vi.fn(),
        downloadZip: vi.fn(async () => undefined),
      },
    });

    await runReconstructionExport({ exportFormat: 'binary' }, deps);

    expect(deps.logError).toHaveBeenCalledWith('Export failed:', error);
    expect(deps.addNotification).toHaveBeenCalledWith('warning', `Export failed: ${error.message}`);
  });

  it.each(['deletions', 'transform'] as const)('ignores a late %s confirmation after cancellation', async stage => {
    let confirm!: (answer: boolean) => void;
    const confirmation = vi.fn(() => new Promise<boolean>(resolve => { confirm = resolve; }));
    const deps = createDeps(stage === 'deletions' ? {
      getPendingDeletionCount: () => 1,
      confirmPendingDeletions: confirmation,
    } : {
      isIdentityTransform: () => false,
      confirmBakeTransform: confirmation,
    });
    const controller = new AbortController();
    const pending = runReconstructionExport({ exportFormat: 'binary', signal: controller.signal }, deps);
    expect(confirmation).toHaveBeenCalledOnce();
    controller.abort();
    await pending;
    confirm(true);
    await Promise.resolve();
    expect(deps.applyDeletionsToData).not.toHaveBeenCalled();
    expect(deps.transformReconstruction).not.toHaveBeenCalled();
    expect(deps.writers.exportBinary).not.toHaveBeenCalled();
    expect(deps.addNotification).not.toHaveBeenCalled();
    expect(deps.logError).not.toHaveBeenCalled();
  });

  it('reports preparation failures through the normal export error notification', async () => {
    const error = new Error('Could not apply deletions');
    const deps = createDeps({
      getPendingDeletionCount: () => 1,
      applyDeletionsToData: vi.fn().mockRejectedValue(error),
    });
    await runReconstructionExport({ exportFormat: 'binary' }, deps);
    expect(deps.writers.exportBinary).not.toHaveBeenCalled();
    expect(deps.logError).toHaveBeenCalledWith('Export failed:', error);
    expect(deps.addNotification).toHaveBeenCalledWith('warning', `Export failed: ${error.message}`);
  });

  it('forwards cancellation and progress to the ZIP writer', async () => {
    const deps = createDeps();
    const signal = new AbortController().signal;
    const onProgress = vi.fn();
    await runReconstructionExport({ exportFormat: 'zip', signal, onProgress }, deps);
    expect(deps.writers.downloadZip).toHaveBeenCalledWith(
      expect.any(Object), { format: 'binary', signal }, undefined, null, onProgress,
    );
  });
});
