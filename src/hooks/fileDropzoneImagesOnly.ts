import type { LoadedFiles, Reconstruction } from '../types/colmap';
import { appLogger } from '../utils/logger';
import { createImagesOnlyReconstruction } from '../utils/fileClassification';

interface ProgressUpdate {
  percent: number;
  message: string;
}

interface RunImagesOnlyLoadOptions {
  imageFiles: Map<string, File>;
  hasMasks: boolean;
  mapProgress: (localPercent: number) => number;
  setUrlProgress: (progress: ProgressUpdate) => void;
  setLoadedFiles: (files: LoadedFiles) => void;
  clearCaches: (options: { preserveZip: true }) => void;
  setReconstruction: (reconstruction: Reconstruction) => void;
  resetView: () => void;
  addNotification: (type: 'info', message: string, duration?: number) => void;
  log?: (message: string) => void;
}

export function runImagesOnlyLoad({
  imageFiles,
  hasMasks,
  mapProgress,
  setUrlProgress,
  setLoadedFiles,
  clearCaches,
  setReconstruction,
  resetView,
  addNotification,
  log = appLogger.info,
}: RunImagesOnlyLoadOptions): Reconstruction {
  log(`[Images-only] Creating gallery from ${imageFiles.size} image lookup keys`);

  setUrlProgress({ percent: mapProgress(50), message: 'Creating image gallery...' });

  const reconstruction = createImagesOnlyReconstruction(imageFiles);

  setLoadedFiles({
    camerasFile: undefined,
    imagesFile: undefined,
    points3DFile: undefined,
    databaseFile: undefined,
    rigsFile: undefined,
    framesFile: undefined,
    imageFiles,
    hasMasks,
  });

  clearCaches({ preserveZip: true });

  setUrlProgress({ percent: mapProgress(95), message: 'Finalizing...' });
  setReconstruction(reconstruction);
  resetView();

  addNotification(
    'info',
    `Loaded ${reconstruction.images.size} images (gallery only, no 3D data)`,
    5000
  );

  log(`[Images-only] Loaded ${reconstruction.images.size} images for gallery viewing`);

  return reconstruction;
}
