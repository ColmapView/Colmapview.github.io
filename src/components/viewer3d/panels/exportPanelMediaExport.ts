import { MediaZipPathConflictError, type MediaZipExportSummary } from '../../../parsers/mediaZipExport';

type MediaExportProgressSetter = (progress: number | null) => void;
type MediaExportNotification = (type: 'info' | 'warning', message: string) => void;
type MediaFetchFunction = (name: string, signal?: AbortSignal) => Promise<File | null>;
type ImageZipDownload = (
  imageNames: string[],
  fetchImage: MediaFetchFunction,
  options: { jpegQuality: number },
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
) => Promise<MediaZipExportSummary>;
type MaskZipDownload = (
  imageNames: string[],
  fetchMask: MediaFetchFunction,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
) => Promise<MediaZipExportSummary>;

export interface RunImageZipExportOptions {
  imageNames: string[];
  jpegQualityPercent: number;
  signal?: AbortSignal;
}

export interface RunImageZipExportDeps {
  fetchImage: MediaFetchFunction;
  downloadImagesZip: ImageZipDownload;
  setProgress: MediaExportProgressSetter;
  addNotification: MediaExportNotification;
  logError: (message: string, error: unknown) => void;
}

export interface RunMaskZipExportOptions {
  imageNames: string[];
  signal?: AbortSignal;
}

export interface RunMaskZipExportDeps {
  fetchMask: MediaFetchFunction;
  downloadMasksZip: MaskZipDownload;
  setProgress: MediaExportProgressSetter;
  addNotification: MediaExportNotification;
  logError: (message: string, error: unknown) => void;
}

function notifyMediaExportResult(
  kind: 'Images' | 'Masks',
  { total, exported, failed }: MediaZipExportSummary,
  addNotification: MediaExportNotification
): void {
  const label = kind.toLowerCase();
  if (exported === 0) {
    addNotification('warning', `No ${label} could be exported.`);
  } else if (failed > 0) {
    addNotification('warning', `Exported ${exported} of ${total} ${label}; ${failed} could not be exported.`);
  } else {
    addNotification('info', `${kind} exported successfully`);
  }
}

export async function runImageZipExport(
  { imageNames, jpegQualityPercent, signal }: RunImageZipExportOptions,
  deps: RunImageZipExportDeps
): Promise<void> {
  if (imageNames.length === 0 || signal?.aborted) return;

  deps.setProgress(0);
  try {
    const summary = await deps.downloadImagesZip(
      imageNames,
      deps.fetchImage,
      { jpegQuality: jpegQualityPercent / 100 },
      deps.setProgress,
      signal,
    );
    if (signal?.aborted) return;
    notifyMediaExportResult('Images', summary, deps.addNotification);
  } catch (err) {
    if (signal?.aborted) return;
    deps.logError('Image export failed:', err);
    deps.addNotification('warning', err instanceof MediaZipPathConflictError ? err.message : 'Image export failed');
  } finally {
    deps.setProgress(null);
  }
}

export async function runMaskZipExport(
  { imageNames, signal }: RunMaskZipExportOptions,
  deps: RunMaskZipExportDeps
): Promise<void> {
  if (imageNames.length === 0 || signal?.aborted) return;

  deps.setProgress(0);
  try {
    const summary = await deps.downloadMasksZip(
      imageNames,
      deps.fetchMask,
      deps.setProgress,
      signal,
    );
    if (signal?.aborted) return;
    notifyMediaExportResult('Masks', summary, deps.addNotification);
  } catch (err) {
    if (signal?.aborted) return;
    deps.logError('Mask export failed:', err);
    deps.addNotification('warning', err instanceof MediaZipPathConflictError ? err.message : 'Mask export failed');
  } finally {
    deps.setProgress(null);
  }
}
