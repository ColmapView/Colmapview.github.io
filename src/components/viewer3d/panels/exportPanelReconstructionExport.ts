import type { Reconstruction } from '../../../types/colmap';
import type { Sim3dEuler } from '../../../types/sim3d';
import type { ReconstructionSource } from '../../../wasm/reconstructionService';
import { isReconstructionSnapshot } from '../../../wasm/reconstructionService';
import type { WasmReconstructionWrapper } from '../../../wasm/reconstruction';
import { exportReconstructionSnapshot } from '../../../parsers/reconstructionSnapshotExport';
import type { ExportFormat } from './exportPanelViewModel';
import type { ZipExportProgressCallback } from '../../../parsers/reconstructionZipExport';
import { awaitWithAbort } from '../../../utils/awaitWithAbort';

export interface LiveReconstructionExportState {
  reconstruction: Reconstruction | null;
  wasmReconstruction: ReconstructionSource | null;
}

export interface RunReconstructionExportOptions {
  exportFormat: ExportFormat;
  loadedImageFiles?: Map<string, File> | null;
  signal?: AbortSignal;
  onProgress?: ZipExportProgressCallback;
}

export interface ReconstructionExportWriters {
  exportBinary: (
    reconstruction: Reconstruction,
    wasmReconstruction?: ReconstructionSource | null,
    signal?: AbortSignal,
  ) => void | Promise<void>;
  exportText: (
    reconstruction: Reconstruction,
    wasmReconstruction?: ReconstructionSource | null,
    signal?: AbortSignal,
  ) => void | Promise<void>;
  exportPly: (
    reconstruction: Reconstruction,
    wasmReconstruction?: ReconstructionSource | null,
    signal?: AbortSignal,
  ) => void | Promise<void>;
  downloadZip: (
    reconstruction: Reconstruction,
    options: { format: 'binary'; signal?: AbortSignal },
    imageFiles?: Map<string, File> | null,
    wasmReconstruction?: ReconstructionSource | null,
    onProgress?: ZipExportProgressCallback,
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
  { exportFormat, loadedImageFiles, signal, onProgress }: RunReconstructionExportOptions,
  deps: RunReconstructionExportDeps
): Promise<void> {
  try {
    signal?.throwIfAborted();
    const pendingDeletionCount = deps.getPendingDeletionCount();
    if (pendingDeletionCount > 0) {
      const proceed = await awaitWithAbort(deps.confirmPendingDeletions(pendingDeletionCount), signal);
      signal?.throwIfAborted();
      if (!proceed) {
        deps.addNotification('info', 'Export cancelled.', 3000);
        return;
      }
      if (await awaitWithAbort(Promise.resolve(deps.applyDeletionsToData()), signal) === false) return;
    }

    signal?.throwIfAborted();
    const transform = deps.getTransform();
    const hasTransform = !deps.isIdentityTransform(transform);
    if (hasTransform) {
      const proceed = await awaitWithAbort(deps.confirmBakeTransform(), signal);
      signal?.throwIfAborted();
      if (!proceed) {
        deps.addNotification('info', 'Export cancelled.', 3000);
        return;
      }
    }

    const { reconstruction, wasmReconstruction } = deps.getLiveReconstruction();
    if (!reconstruction) return;

    if (isReconstructionSnapshot(wasmReconstruction)) {
      await exportReconstructionSnapshot(wasmReconstruction, exportFormat, loadedImageFiles, hasTransform ? transform : undefined, signal, onProgress);
      return;
    }
    const exportReconstruction = hasTransform
      ? deps.transformReconstruction(transform, reconstruction, wasmReconstruction)
      : reconstruction;
    switch (exportFormat) {
      case 'binary':
        await deps.writers.exportBinary(exportReconstruction, wasmReconstruction, signal);
        break;
      case 'text':
        await deps.writers.exportText(exportReconstruction, wasmReconstruction, signal);
        break;
      case 'ply':
        await deps.writers.exportPly(exportReconstruction, wasmReconstruction, signal);
        break;
      case 'zip':
        await deps.writers.downloadZip(
          exportReconstruction,
          { format: 'binary', signal },
          loadedImageFiles,
          wasmReconstruction,
          onProgress,
        );
        break;
    }
  } catch (err) {
    if (signal?.aborted) return;
    deps.logError('Export failed:', err);
    deps.addNotification('warning', 'Export failed');
  }
}
