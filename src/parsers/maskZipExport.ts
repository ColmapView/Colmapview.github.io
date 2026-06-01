import { downloadBlob } from '../utils/download';
import { appLogger } from '../utils/logger';
import { createZipBlob } from './zipExportPolicy';

export type MaskFetchFunction = (imageName: string) => Promise<File | null>;
export type MaskZipProgressCallback = (percent: number, message?: string) => void;

/**
 * Converts an image path to the COLMAP mask ZIP path convention:
 * "images/cam1/photo.jpg" -> "masks/cam1/photo.jpg.png".
 */
export function normalizeMaskPath(imageName: string): string {
  let normalized = imageName.replace(/\\/g, '/');
  if (normalized.startsWith('images/')) {
    normalized = normalized.slice(7);
  }
  return `masks/${normalized}.png`;
}

export async function exportMasksZip(
  imageNames: string[],
  fetchMask: MaskFetchFunction,
  onProgress?: MaskZipProgressCallback
): Promise<Blob> {
  const { zipSync } = await import('fflate');

  const totalImages = imageNames.length;
  const zipData: Record<string, Uint8Array> = {};
  let processed = 0;
  let failed = 0;

  for (const imageName of imageNames) {
    try {
      const file = await fetchMask(imageName);
      if (!file) {
        failed++;
        processed++;
        onProgress?.(Math.round((processed / totalImages) * 100), `Skipped: ${imageName}`);
        continue;
      }

      const arrayBuffer = await file.arrayBuffer();
      zipData[normalizeMaskPath(imageName)] = new Uint8Array(arrayBuffer);
    } catch (err) {
      appLogger.warn(`[Mask Export] Failed to process ${imageName}:`, err);
      failed++;
    }

    processed++;
    onProgress?.(Math.round((processed / totalImages) * 100));
  }

  if (failed > 0) {
    appLogger.warn(`[Mask Export] ${failed}/${totalImages} masks failed to export`);
  }

  const zipped = zipSync(zipData, { level: 6 });
  return createZipBlob(zipped);
}

export async function downloadMasksZip(
  imageNames: string[],
  fetchMask: MaskFetchFunction,
  onProgress?: MaskZipProgressCallback
): Promise<void> {
  const blob = await exportMasksZip(imageNames, fetchMask, onProgress);
  downloadBlob(blob, 'masks.zip');
}
