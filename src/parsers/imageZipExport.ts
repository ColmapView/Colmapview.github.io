import { downloadBlob } from '../utils/download';
import { convertToJpeg } from '../utils/convertToJpeg';
import { exportMediaZip, type MediaZipExportResult, type MediaZipExportSummary } from './mediaZipExport';

export interface ImageZipExportOptions {
  /** JPEG quality (0-1, e.g., 0.85 for 85%) */
  jpegQuality: number;
}

export type ImageZipProgressCallback = (percent: number, message?: string) => void;
export type ImageFetchFunction = (imageName: string, signal?: AbortSignal) => Promise<File | null>;

export { convertToJpeg } from '../utils/convertToJpeg';

export function normalizeImageZipPath(path: string): string {
  let normalized = path.replace(/\\/g, '/');
  if (!normalized.startsWith('images/')) {
    normalized = 'images/' + normalized;
  }
  return normalized;
}

export function toJpegZipPath(path: string): string {
  const normalized = normalizeImageZipPath(path);
  const extensionStart = normalized.lastIndexOf('.');
  const basenameStart = normalized.lastIndexOf('/') + 1;
  return (extensionStart > basenameStart ? normalized.slice(0, extensionStart) : normalized) + '.jpg';
}

function buildImagesZip(
  imageNames: string[],
  fetchImage: ImageFetchFunction,
  options: ImageZipExportOptions,
  onProgress?: ImageZipProgressCallback,
  signal?: AbortSignal,
): Promise<MediaZipExportResult> {
  return exportMediaZip({
    kind: 'Image',
    imageNames,
    fetchFile: fetchImage,
    toZipPath: toJpegZipPath,
    readFile: async (file) => (await convertToJpeg(file, options.jpegQuality, signal)).arrayBuffer(),
    onProgress,
    signal,
  });
}

export async function exportImagesZip(
  imageNames: string[],
  fetchImage: ImageFetchFunction,
  options: ImageZipExportOptions,
  onProgress?: ImageZipProgressCallback,
  signal?: AbortSignal,
): Promise<Blob> {
  return (await buildImagesZip(imageNames, fetchImage, options, onProgress, signal)).blob;
}

export async function downloadImagesZip(
  imageNames: string[],
  fetchImage: ImageFetchFunction,
  options: ImageZipExportOptions,
  onProgress?: ImageZipProgressCallback,
  signal?: AbortSignal,
): Promise<MediaZipExportSummary> {
  const { blob, summary } = await buildImagesZip(imageNames, fetchImage, options, onProgress, signal);
  signal?.throwIfAborted();
  if (summary.exported > 0) downloadBlob(blob, 'images.zip');
  return summary;
}
