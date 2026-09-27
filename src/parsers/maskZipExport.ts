import { downloadBlob } from '../utils/download';
import { exportMediaZip, type MediaZipExportResult, type MediaZipExportSummary } from './mediaZipExport';

export type MaskFetchFunction = (imageName: string, signal?: AbortSignal) => Promise<File | null>;
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

function buildMasksZip(
  imageNames: string[],
  fetchMask: MaskFetchFunction,
  onProgress?: MaskZipProgressCallback,
  signal?: AbortSignal,
): Promise<MediaZipExportResult> {
  return exportMediaZip({
    kind: 'Mask',
    imageNames,
    fetchFile: fetchMask,
    toZipPath: normalizeMaskPath,
    readFile: (file) => file.arrayBuffer(),
    onProgress,
    signal,
  });
}

export async function exportMasksZip(
  imageNames: string[],
  fetchMask: MaskFetchFunction,
  onProgress?: MaskZipProgressCallback,
  signal?: AbortSignal,
): Promise<Blob> {
  return (await buildMasksZip(imageNames, fetchMask, onProgress, signal)).blob;
}

export async function downloadMasksZip(
  imageNames: string[],
  fetchMask: MaskFetchFunction,
  onProgress?: MaskZipProgressCallback,
  signal?: AbortSignal,
): Promise<MediaZipExportSummary> {
  const { blob, summary } = await buildMasksZip(imageNames, fetchMask, onProgress, signal);
  signal?.throwIfAborted();
  if (summary.exported > 0) downloadBlob(blob, 'masks.zip');
  return summary;
}
