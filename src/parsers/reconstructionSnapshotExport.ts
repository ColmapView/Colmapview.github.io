import type { Sim3dEuler } from '../types/sim3d';
import type { ReconstructionSnapshot } from '../wasm/reconstructionService';
import type { ReconstructionExportFiles } from '../wasm/reconstructionProtocol';
import { downloadFile } from '../utils/download';
import { awaitWithAbort } from '../utils/awaitWithAbort';
import {
  downloadReconstructionZipFromWriters, exportReconstructionZipFromWriters,
  type ReconstructionZipFileWriters, type ZipExportOptions, type ZipExportProgressCallback,
} from './reconstructionZipExport';

export function snapshotZipWriters(files: ReconstructionExportFiles, format: 'binary' | 'text'): ReconstructionZipFileWriters {
  const extension = format === 'binary' ? 'bin' : 'txt';
  const read = (name: string) => {
    const file = files[`${name}.${extension}`];
    if (!file) throw new Error(`Reconstruction service did not export ${name}.${extension}`);
    return file;
  };
  return {
    writeCameras: () => read('cameras'), writeImages: () => read('images'), writePoints3D: () => read('points3D'),
    writeRigs: files[`rigs.${extension}`] ? () => read('rigs') : undefined,
    writeFrames: files[`frames.${extension}`] ? () => read('frames') : undefined,
  };
}

export async function exportReconstructionSnapshot(
  snapshot: ReconstructionSnapshot,
  format: 'binary' | 'text' | 'ply' | 'zip',
  imageFiles?: Map<string, File> | null,
  transform?: Sim3dEuler,
  signal?: AbortSignal,
  onProgress?: ZipExportProgressCallback,
): Promise<void> {
  signal?.throwIfAborted();
  onProgress?.(0, 'Preparing COLMAP files...');
  const files = await awaitWithAbort(snapshot.export({ format: format === 'zip' ? 'binary' : format, transform }, signal), signal);
  signal?.throwIfAborted();
  if (format === 'zip') {
    await downloadReconstructionZipFromWriters(snapshotZipWriters(files, 'binary'), { format: 'binary', signal }, imageFiles, onProgress);
    return;
  }
  for (const [name, bytes] of Object.entries(files)) downloadFile(bytes.buffer as ArrayBuffer, name);
  onProgress?.(100, 'Done');
}

export async function exportSnapshotZip(
  snapshot: ReconstructionSnapshot, options: ZipExportOptions,
  imageFiles?: Map<string, File> | null, onProgress?: ZipExportProgressCallback,
): Promise<Blob> {
  options.signal?.throwIfAborted();
  const files = await awaitWithAbort(snapshot.export({ format: options.format }, options.signal), options.signal);
  options.signal?.throwIfAborted();
  return exportReconstructionZipFromWriters(snapshotZipWriters(files, options.format), options, imageFiles, onProgress);
}
