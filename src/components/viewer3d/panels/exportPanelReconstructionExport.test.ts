import { describe, expect, it, vi } from 'vitest';
import { buildReconstruction } from '../../../test/builders';
import type { Sim3dEuler } from '../../../types/sim3d';
import {
  runReconstructionExport,
  type RunReconstructionExportDeps,
} from './exportPanelReconstructionExport';

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
      { format: 'binary' },
      imageFiles,
      null
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
    expect(deps.writers.exportBinary).toHaveBeenCalledWith(transformed, null);
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
    expect(deps.addNotification).toHaveBeenCalledWith('warning', 'Export failed');
  });
});
