import { downloadBlob } from '../utils/download';
import { appLogger } from '../utils/logger';
import { awaitWithAbort } from '../utils/awaitWithAbort';
import { compressZip, type ZipFiles } from './zipCompression';
import {
  normalizeZipCompressionLevel,
} from './zipExportPolicy';
import type { ZipCompressionLevel } from './zipExportPolicy';

export interface ZipExportOptions {
  /** Export format for COLMAP files */
  format: 'binary' | 'text';
  /** Include source images in ZIP */
  includeImages?: boolean;
  /** Include mask images in ZIP */
  includeMasks?: boolean;
  /** Compression level (0-9, default 6) */
  compressionLevel?: number;
  /** Stop preparation/compression and prevent a late download. */
  signal?: AbortSignal;
}

export type ZipExportProgressCallback = (percent: number, message: string) => void;

export { normalizeZipCompressionLevel };
export type { ZipCompressionLevel };

export interface ReconstructionZipFileWriters {
  writeCameras: () => Uint8Array;
  writeImages: () => Uint8Array;
  writePoints3D: () => Uint8Array;
  writeRigs?: () => Uint8Array;
  writeFrames?: () => Uint8Array;
}

export function normalizeReconstructionZipImagePath(path: string): string {
  let imagePath = path.replace(/\\/g, '/');
  if (!imagePath.startsWith('images/')) {
    imagePath = `images/${imagePath}`;
  }
  return imagePath;
}

function shouldIncludeImagePath(path: string, file: File): boolean {
  const normalized = path.replace(/\\/g, '/');
  return normalized.includes('/') || normalized === file.name;
}

function toZipBytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(data);
}

async function addImageFilesToZip(
  files: ZipFiles,
  imageFiles: Map<string, File>,
  onProgress?: ZipExportProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  onProgress?.(25, 'Adding images...');

  let imageCount = 0;
  const totalImages = imageFiles.size;
  const uniqueFiles = new Map<File, string>();

  for (const [path, file] of imageFiles) {
    const existingPath = uniqueFiles.get(file);
    if (
      existingPath === undefined ||
      (!shouldIncludeImagePath(existingPath, file) && shouldIncludeImagePath(path, file))
    ) {
      uniqueFiles.set(file, path);
    }
  }

  for (const [file, path] of uniqueFiles) {
    signal?.throwIfAborted();
    if (!shouldIncludeImagePath(path, file)) continue;

    const imagePath = normalizeReconstructionZipImagePath(path);

    try {
      const buffer = await awaitWithAbort(file.arrayBuffer(), signal);
      signal?.throwIfAborted();
      files[imagePath] = new Uint8Array(buffer);
      imageCount++;

      if (imageCount % 10 === 0) {
        const percent = 25 + Math.round((imageCount / totalImages) * 50);
        onProgress?.(percent, `Adding images (${imageCount}/${totalImages})...`);
      }
    } catch (err) {
      signal?.throwIfAborted();
      appLogger.warn(`[ZIP Export] Failed to add image: ${path}`, err);
    }
  }
}

export async function exportReconstructionZipFromWriters(
  fileWriters: ReconstructionZipFileWriters,
  options: ZipExportOptions,
  imageFiles?: Map<string, File> | null,
  onProgress?: ZipExportProgressCallback
): Promise<Blob> {
  const { signal } = options;
  signal?.throwIfAborted();
  const files: ZipFiles = {};
  const extension = options.format === 'binary' ? 'bin' : 'txt';

  onProgress?.(5, 'Exporting cameras...');
  files[`sparse/0/cameras.${extension}`] = toZipBytes(fileWriters.writeCameras());
  onProgress?.(10, 'Exporting images...');
  files[`sparse/0/images.${extension}`] = toZipBytes(fileWriters.writeImages());
  onProgress?.(15, 'Exporting points3D...');
  files[`sparse/0/points3D.${extension}`] = toZipBytes(fileWriters.writePoints3D());

  onProgress?.(20, 'Exporting rig data...');
  if (fileWriters.writeRigs) {
    files[`sparse/0/rigs.${extension}`] = toZipBytes(fileWriters.writeRigs());
  }
  if (fileWriters.writeFrames) {
    files[`sparse/0/frames.${extension}`] = toZipBytes(fileWriters.writeFrames());
  }

  if (options.includeImages && imageFiles && imageFiles.size > 0) {
    await addImageFilesToZip(files, imageFiles, onProgress, signal);
  }

  onProgress?.(85, 'Compressing...');
  const blob = await compressZip(files, { signal, level: options.compressionLevel });
  signal?.throwIfAborted();

  onProgress?.(100, 'Done');
  return blob;
}

export async function downloadReconstructionZipFromWriters(
  fileWriters: ReconstructionZipFileWriters,
  options: ZipExportOptions,
  imageFiles?: Map<string, File> | null,
  onProgress?: ZipExportProgressCallback,
  filename: string = 'reconstruction.zip'
): Promise<void> {
  const blob = await exportReconstructionZipFromWriters(
    fileWriters,
    options,
    imageFiles,
    onProgress
  );

  options.signal?.throwIfAborted();
  downloadBlob(blob, filename);
}
