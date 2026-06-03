import type { Reconstruction } from '../../../types/colmap';
import type { Sim3dEuler } from '../../../types/sim3d';
import type { WasmReconstructionWrapper } from '../../../wasm/reconstruction';
import type { ExportFormat } from './exportPanelViewModel';

export interface LiveReconstructionExportState {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
}

export interface RunReconstructionExportOptions {
  exportFormat: ExportFormat;
  loadedImageFiles?: Map<string, File> | null;
}

export interface ReconstructionExportWriters {
  exportBinary: (
    reconstruction: Reconstruction,
    wasmReconstruction?: WasmReconstructionWrapper | null
  ) => void;
  exportText: (
    reconstruction: Reconstruction,
    wasmReconstruction?: WasmReconstructionWrapper | null
  ) => void;
  exportPly: (
    reconstruction: Reconstruction,
    wasmReconstruction?: WasmReconstructionWrapper | null
  ) => void;
  downloadZip: (
    reconstruction: Reconstruction,
    options: { format: 'binary' },
    imageFiles?: Map<string, File> | null,
    wasmReconstruction?: WasmReconstructionWrapper | null
  ) => Promise<void>;
}

export interface RunReconstructionExportDeps {
  getPendingDeletionCount: () => number;
  confirmPendingDeletions: (count: number) => Promise<boolean>;
  applyDeletionsToData: () => void;
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
    deps.applyDeletionsToData();
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

  const exportReconstruction = hasTransform
    ? deps.transformReconstruction(transform, reconstruction, wasmReconstruction)
    : reconstruction;

  try {
    switch (exportFormat) {
      case 'binary':
        deps.writers.exportBinary(exportReconstruction, wasmReconstruction);
        break;
      case 'text':
        deps.writers.exportText(exportReconstruction, wasmReconstruction);
        break;
      case 'ply':
        deps.writers.exportPly(exportReconstruction, wasmReconstruction);
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
