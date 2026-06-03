type MediaExportProgressSetter = (progress: number | null) => void;
type MediaExportNotification = (type: 'info' | 'warning', message: string) => void;
type MediaFetchFunction = (name: string) => Promise<File | null>;
type ImageZipDownload = (
  imageNames: string[],
  fetchImage: MediaFetchFunction,
  options: { jpegQuality: number },
  onProgress: (percent: number) => void
) => Promise<void>;
type MaskZipDownload = (
  imageNames: string[],
  fetchMask: MediaFetchFunction,
  onProgress: (percent: number) => void
) => Promise<void>;

export interface RunImageZipExportOptions {
  imageNames: string[];
  jpegQualityPercent: number;
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
}

export interface RunMaskZipExportDeps {
  fetchMask: MediaFetchFunction;
  downloadMasksZip: MaskZipDownload;
  setProgress: MediaExportProgressSetter;
  addNotification: MediaExportNotification;
  logError: (message: string, error: unknown) => void;
}

export async function runImageZipExport(
  { imageNames, jpegQualityPercent }: RunImageZipExportOptions,
  deps: RunImageZipExportDeps
): Promise<void> {
  if (imageNames.length === 0) return;

  deps.setProgress(0);
  try {
    await deps.downloadImagesZip(
      imageNames,
      deps.fetchImage,
      { jpegQuality: jpegQualityPercent / 100 },
      deps.setProgress
    );
    deps.addNotification('info', 'Images exported successfully');
  } catch (err) {
    deps.logError('Image export failed:', err);
    deps.addNotification('warning', 'Image export failed');
  } finally {
    deps.setProgress(null);
  }
}

export async function runMaskZipExport(
  { imageNames }: RunMaskZipExportOptions,
  deps: RunMaskZipExportDeps
): Promise<void> {
  if (imageNames.length === 0) return;

  deps.setProgress(0);
  try {
    await deps.downloadMasksZip(
      imageNames,
      deps.fetchMask,
      deps.setProgress
    );
    deps.addNotification('info', 'Masks exported successfully');
  } catch (err) {
    deps.logError('Mask export failed:', err);
    deps.addNotification('warning', 'Mask export failed');
  } finally {
    deps.setProgress(null);
  }
}
