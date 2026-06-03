/**
 * COLMAP data export functions for text and binary formats.
 *
 * These writers produce files compatible with COLMAP's standard formats,
 * matching the specifications in reconstruction_io_text.cc and reconstruction_io_binary.cc.
 */

import type {
  Point3D,
  Reconstruction,
  Point3DId,
} from '../types/colmap';
import type { WasmReconstructionWrapper } from '../wasm/reconstruction';
import {
  downloadReconstructionZipFromWriters,
  exportReconstructionZipFromWriters,
} from './reconstructionZipExport';
import {
  exportPointsPLYFile,
  exportReconstructionBinaryFiles,
  exportReconstructionTextFiles,
} from './reconstructionFileExport';
import { getPoints3DForExport } from './reconstructionExportData';
import type {
  ReconstructionZipFileWriters,
  ZipExportOptions,
  ZipExportProgressCallback,
} from './reconstructionZipExport';
import {
  writeCamerasText,
  writeFramesText,
  writeImagesText,
  writePoints3DText,
  writeRigsText,
} from './colmapTextWriters';
import {
  writeCamerasBinary,
  writeFramesBinary,
  writeImagesBinary,
  writePoints3DBinary,
  writeRigsBinary,
} from './colmapBinaryWriters';
import { writePointsPLY } from './colmapPlyWriter';

export { downloadBlob, downloadFile, __resetDownloadSchedulerForTests } from '../utils/download';
export {
  writeCamerasText,
  writeFramesText,
  writeImagesText,
  writePoints3DText,
  writeRigsText,
} from './colmapTextWriters';
export {
  writeCamerasBinary,
  writeFramesBinary,
  writeImagesBinary,
  writePoints3DBinary,
  writeRigsBinary,
} from './colmapBinaryWriters';
export { writePointsPLY } from './colmapPlyWriter';
export { getPoints3DForExport } from './reconstructionExportData';
export type { ExportPointSource } from './reconstructionExportData';
export {
  downloadReconstructionZipFromWriters,
  exportReconstructionZipFromWriters,
  normalizeReconstructionZipImagePath,
  normalizeZipCompressionLevel,
} from './reconstructionZipExport';
export type {
  ReconstructionZipFileWriters,
  ZipCompressionLevel,
  ZipExportOptions,
  ZipExportProgressCallback,
} from './reconstructionZipExport';
export {
  downloadImagesZip,
  exportImagesZip,
} from './imageZipExport';
export type {
  ImageFetchFunction,
  ImageZipExportOptions,
  ImageZipProgressCallback,
} from './imageZipExport';
export {
  downloadMasksZip,
  exportMasksZip,
  normalizeMaskPath,
} from './maskZipExport';
export type {
  MaskFetchFunction,
  MaskZipProgressCallback,
} from './maskZipExport';

/**
 * Export full reconstruction to COLMAP text format.
 * Downloads cameras.txt, images.txt, points3D.txt, and optionally rigs.txt, frames.txt
 *
 * @param reconstruction - The reconstruction to export
 * @param wasmReconstruction - Optional WASM wrapper (used to build points3D if not in reconstruction)
 */
export function exportReconstructionText(
  reconstruction: Reconstruction,
  wasmReconstruction?: WasmReconstructionWrapper | null
): void {
  const points3D = getPoints3DForExport(reconstruction, wasmReconstruction);
  const { rigs, frames } = reconstruction.rigData ?? {};

  exportReconstructionTextFiles({
    writeCameras: () => writeCamerasText(reconstruction.cameras),
    writeImages: () => writeImagesText(reconstruction.images, wasmReconstruction),
    writePoints3D: () => writePoints3DText(points3D),
    writeRigs: rigs && rigs.size > 0 ? () => writeRigsText(rigs) : undefined,
    writeFrames: frames && frames.size > 0 ? () => writeFramesText(frames) : undefined,
  });
}

/**
 * Export full reconstruction to COLMAP binary format.
 * Downloads cameras.bin, images.bin, points3D.bin, and optionally rigs.bin, frames.bin
 *
 * @param reconstruction - The reconstruction to export
 * @param wasmReconstruction - Optional WASM wrapper (used to build points3D if not in reconstruction)
 */
export function exportReconstructionBinary(
  reconstruction: Reconstruction,
  wasmReconstruction?: WasmReconstructionWrapper | null
): void {
  const points3D = getPoints3DForExport(reconstruction, wasmReconstruction);
  const { rigs, frames } = reconstruction.rigData ?? {};

  exportReconstructionBinaryFiles({
    writeCameras: () => writeCamerasBinary(reconstruction.cameras),
    writeImages: () => writeImagesBinary(reconstruction.images, wasmReconstruction),
    writePoints3D: () => writePoints3DBinary(points3D),
    writeRigs: rigs && rigs.size > 0 ? () => writeRigsBinary(rigs) : undefined,
    writeFrames: frames && frames.size > 0 ? () => writeFramesBinary(frames) : undefined,
  });
}

/**
 * Export point cloud as PLY file.
 *
 * @param reconstruction - The reconstruction to export
 * @param wasmReconstruction - Optional WASM wrapper (used to build points3D if not in reconstruction)
 */
export function exportPointsPLY(
  reconstruction: Reconstruction,
  wasmReconstruction?: WasmReconstructionWrapper | null
): void {
  const points3D = getPoints3DForExport(reconstruction, wasmReconstruction);
  exportPointsPLYFile(() => writePointsPLY(points3D));
}

function createReconstructionZipFileWriters(
  reconstruction: Reconstruction,
  options: ZipExportOptions,
  wasmReconstruction?: WasmReconstructionWrapper | null
): ReconstructionZipFileWriters {
  let points3D: Map<Point3DId, Point3D> | null = null;
  const getPoints3D = () => {
    points3D ??= getPoints3DForExport(reconstruction, wasmReconstruction);
    return points3D;
  };

  if (options.format === 'binary') {
    return {
      writeCameras: () => new Uint8Array(writeCamerasBinary(reconstruction.cameras)),
      writeImages: () => new Uint8Array(writeImagesBinary(reconstruction.images, wasmReconstruction)),
      writePoints3D: () => new Uint8Array(writePoints3DBinary(getPoints3D())),
      writeRigs: reconstruction.rigData?.rigs.size
        ? () => new Uint8Array(writeRigsBinary(reconstruction.rigData!.rigs))
        : undefined,
      writeFrames: reconstruction.rigData?.frames.size
        ? () => new Uint8Array(writeFramesBinary(reconstruction.rigData!.frames))
        : undefined,
    };
  }

  const encoder = new TextEncoder();
  return {
    writeCameras: () => encoder.encode(writeCamerasText(reconstruction.cameras)),
    writeImages: () => encoder.encode(writeImagesText(reconstruction.images, wasmReconstruction)),
    writePoints3D: () => encoder.encode(writePoints3DText(getPoints3D())),
    writeRigs: reconstruction.rigData?.rigs.size
      ? () => encoder.encode(writeRigsText(reconstruction.rigData!.rigs))
      : undefined,
    writeFrames: reconstruction.rigData?.frames.size
      ? () => encoder.encode(writeFramesText(reconstruction.rigData!.frames))
      : undefined,
  };
}

/**
 * Export reconstruction as a ZIP file.
 * Uses fflate for compression (small bundle, fast).
 *
 * @param reconstruction - The reconstruction to export
 * @param options - Export options (format, include images, compression level)
 * @param imageFiles - Optional map of image files to include
 * @param wasmReconstruction - Optional WASM wrapper (used to build points3D if not in reconstruction)
 * @param onProgress - Optional progress callback
 * @returns Blob containing the ZIP file
 */
export async function exportReconstructionZip(
  reconstruction: Reconstruction,
  options: ZipExportOptions,
  imageFiles?: Map<string, File> | null,
  wasmReconstruction?: WasmReconstructionWrapper | null,
  onProgress?: ZipExportProgressCallback
): Promise<Blob> {
  return exportReconstructionZipFromWriters(
    createReconstructionZipFileWriters(reconstruction, options, wasmReconstruction),
    options,
    imageFiles,
    onProgress
  );
}

/**
 * Export reconstruction as a ZIP file and download it.
 *
 * @param reconstruction - The reconstruction to export
 * @param options - Export options (format, include images, compression level)
 * @param imageFiles - Optional map of image files to include
 * @param wasmReconstruction - Optional WASM wrapper (used to build points3D if not in reconstruction)
 * @param onProgress - Optional progress callback
 * @param filename - Output filename (default: 'reconstruction.zip')
 */
export async function downloadReconstructionZip(
  reconstruction: Reconstruction,
  options: ZipExportOptions,
  imageFiles?: Map<string, File> | null,
  wasmReconstruction?: WasmReconstructionWrapper | null,
  onProgress?: ZipExportProgressCallback,
  filename: string = 'reconstruction.zip'
): Promise<void> {
  await downloadReconstructionZipFromWriters(
    createReconstructionZipFileWriters(reconstruction, options, wasmReconstruction),
    options,
    imageFiles,
    onProgress,
    filename
  );
}
