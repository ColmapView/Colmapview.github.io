import type { Reconstruction } from '../../../types/colmap';
import type { Sim3dEuler } from '../../../types/sim3d';
import type { ReconstructionSource } from '../../../wasm/reconstructionService';
import { isReconstructionSnapshot } from '../../../wasm/reconstructionService';
import type { WasmReconstructionWrapper } from '../../../wasm/reconstruction';
import { exportReconstructionSnapshot } from '../../../parsers/reconstructionSnapshotExport';
import type { ExportFormat } from './exportPanelViewModel';

export interface LiveReconstructionExportState {
  reconstruction: Reconstruction | null;
  wasmReconstruction: ReconstructionSource | null;
}

export interface RunReconstructionExportOptions {
  exportFormat: ExportFormat;
  loadedImageFiles?: Map<string, File> | null;
}

export interface ReconstructionExportWriters {
  exportBinary: (
    reconstruction: Reconstruction,
    wasmReconstruction?: ReconstructionSource | null
  ) => void | Promise<void>;
  exportText: (
    reconstruction: Reconstruction,
    wasmReconstruction?: ReconstructionSource | null
  ) => void | Promise<void>;
  exportPly: (
    reconstruction: Reconstruction,
    wasmReconstruction?: ReconstructionSource | null
  ) => void | Promise<void>;
  downloadZip: (
    reconstruction: Reconstruction,
    options: { format: 'binary' },
    imageFiles?: Map<string, File> | null,
    wasmReconstruction?: ReconstructionSource | null
  ) => Promise<void>;
}

export interface RunReconstructionExportDeps {
  getPendingDeletionCount: () => number;
  confirmPendingDeletions: (count: number) => Promise<boolean>;
  applyDeletionsToData: () => void | boolean | Promise<boolean>;
  getTransform: () => Sim3dEuler;
  isIdentityTransform: (transform: Sim3dEuler) => boolean;
  confirmBakeTransform: () => Promise<boolean>;
  getLiveReconstruction: () => LiveReconstructionExportState;
  transformReconstruction: (
    transform: Sim3dEuler,
    reconstruction: Reconstruction,
    wasmReconstruction: WasmReconstructionWrapper | null
  ) => Reconstruction;
  writers: ReconstructionExportWriters;
  addNotification: (type: 'info' | 'warning', message: string, duration?: number) => void;
  logError: (message: string, error: unknown) => void;
}

export async function runReconstructionExport(
  { exportFormat, loadedImageFiles }: RunReconstructionExportOptions,
  deps: RunReconstructionExportDeps
): Promise<void> {
  const pendingDeletionCount = deps.getPendingDeletionCount();
  if (pendingDeletionCount > 0) {
    const proceed = await deps.confirmPendingDeletions(pendingDeletionCount);
    if (!proceed) {
      deps.addNotification('info', 'Export cancelled.', 3000);
      return;
    }
    if (await deps.applyDeletionsToData() === false) return;
  }

  const transform = deps.getTransform();
  const hasTransform = !deps.isIdentityTransform(transform);
  if (hasTransform) {
    const proceed = await deps.confirmBakeTransform();
    if (!proceed) {
      deps.addNotification('info', 'Export cancelled.', 3000);
      return;
    }
  }

  const { reconstruction, wasmReconstruction } = deps.getLiveReconstruction();
  if (!reconstruction) return;

  try {
    if (isReconstructionSnapshot(wasmReconstruction)) {
      await exportReconstructionSnapshot(wasmReconstruction, exportFormat, loadedImageFiles, hasTransform ? transform : undefined);
      return;
    }
    const exportReconstruction = hasTransform
      ? deps.transformReconstruction(transform, reconstruction, wasmReconstruction)
      : reconstruction;
    switch (exportFormat) {
      case 'binary':
        await deps.writers.exportBinary(exportReconstruction, wasmReconstruction);
        break;
      case 'text':
        await deps.writers.exportText(exportReconstruction, wasmReconstruction);
        break;
      case 'ply':
        await deps.writers.exportPly(exportReconstruction, wasmReconstruction);
        break;
      case 'zip':
        await deps.writers.downloadZip(
          exportReconstruction,
          { format: 'binary' },
          loadedImageFiles,
          wasmReconstruction
        );
        break;
    }
  } catch (err) {
    deps.logError('Export failed:', err);
    deps.addNotification('warning', 'Export failed');
  }
}
