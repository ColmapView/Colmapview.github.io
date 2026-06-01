import { downloadBlob } from '../utils/download';
import { appLogger } from '../utils/logger';
import { createZipBlob } from './zipExportPolicy';

export interface ImageZipExportOptions {
  /** JPEG quality (0-1, e.g., 0.85 for 85%) */
  jpegQuality: number;
}

export type ImageZipProgressCallback = (percent: number, message?: string) => void;
export type ImageFetchFunction = (imageName: string) => Promise<File | null>;

export function isJpegFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') return true;
  const name = file.name.toLowerCase();
  return name.endsWith('.jpg') || name.endsWith('.jpeg');
}

export async function convertToJpeg(file: File, quality: number): Promise<Blob> {
  const effectiveQuality = isJpegFile(file) ? Math.min(quality, 0.85) : quality;
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality: effectiveQuality });
}

export function normalizeImageZipPath(path: string): string {
  let normalized = path.replace(/\\/g, '/');
  if (!normalized.startsWith('images/')) {
    normalized = 'images/' + normalized;
  }
  return normalized;
}

export function toJpegZipPath(path: string): string {
  return normalizeImageZipPath(path).replace(/\.[^.]+$/, '.jpg');
}

export async function exportImagesZip(
  imageNames: string[],
  fetchImage: ImageFetchFunction,
  options: ImageZipExportOptions,
  onProgress?: ImageZipProgressCallback
): Promise<Blob> {
  const { zipSync } = await import('fflate');

  const totalImages = imageNames.length;
  const zipData: Record<string, Uint8Array> = {};
  let processed = 0;
  let failed = 0;

  for (const imageName of imageNames) {
    try {
      const file = await fetchImage(imageName);
      if (!file) {
        failed++;
        processed++;
        onProgress?.(Math.round((processed / totalImages) * 100), `Skipped: ${imageName}`);
        continue;
      }

      const jpegBlob = await convertToJpeg(file, options.jpegQuality);
      const arrayBuffer = await jpegBlob.arrayBuffer();
      zipData[toJpegZipPath(imageName)] = new Uint8Array(arrayBuffer);
    } catch (err) {
      appLogger.warn(`[Image Export] Failed to process ${imageName}:`, err);
      failed++;
    }

    processed++;
    onProgress?.(Math.round((processed / totalImages) * 100));
  }

  if (failed > 0) {
    appLogger.warn(`[Image Export] ${failed}/${totalImages} images failed to export`);
  }

  const zipped = zipSync(zipData, { level: 6 });
  return createZipBlob(zipped);
}

export async function downloadImagesZip(
  imageNames: string[],
  fetchImage: ImageFetchFunction,
  options: ImageZipExportOptions,
  onProgress?: ImageZipProgressCallback
): Promise<void> {
  const blob = await exportImagesZip(imageNames, fetchImage, options, onProgress);
  downloadBlob(blob, 'images.zip');
}
