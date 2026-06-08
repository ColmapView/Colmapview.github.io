import type { LoadedFiles, Reconstruction } from '../types/colmap';
import { createEmptyReconstruction } from '../utils/fileClassification';
import { appLogger } from '../utils/logger';

interface ProgressUpdate {
  percent: number;
  message: string;
  currentFile?: string;
}

interface RunSplatOnlyLoadOptions {
  splatFile: File;
  splatFiles: File[];
  mapProgress: (localPercent: number) => number;
  setUrlProgress: (progress: ProgressUpdate) => void;
  setLoadedFiles: (files: LoadedFiles) => void;
  clearSplatPsnr?: () => void;
  clearCaches: (options: { preserveZip: true }) => void;
  setReconstruction: (reconstruction: Reconstruction) => void;
  resetView: () => void;
  addNotification: (type: 'info', message: string, duration?: number) => void;
  log?: (message: string) => void;
}

export function runSplatOnlyLoad({
  splatFile,
  splatFiles,
  mapProgress,
  setUrlProgress,
  setLoadedFiles,
  clearSplatPsnr,
  clearCaches,
  setReconstruction,
  resetView,
  addNotification,
  log = appLogger.info,
}: RunSplatOnlyLoadOptions): Reconstruction {
  log(`[Splats] Creating splat-only scene from ${splatFile.name}`);

  setUrlProgress({
    percent: mapProgress(50),
    message: 'Loading splat scene...',
    currentFile: splatFile.name,
  });

  const reconstruction = createEmptyReconstruction();

  clearSplatPsnr?.();
  setLoadedFiles({
    camerasFile: undefined,
    imagesFile: undefined,
    points3DFile: undefined,
    splatFile,
    splatFiles,
    databaseFile: undefined,
    rigsFile: undefined,
    framesFile: undefined,
    imageFiles: new Map(),
    hasMasks: false,
  });

  clearCaches({ preserveZip: true });

  setUrlProgress({ percent: mapProgress(95), message: 'Finalizing...' });
  setReconstruction(reconstruction);
  resetView();

  addNotification('info', `Loaded splat: ${splatFile.name}`, 5000);
  log(`[Splats] Loaded splat-only scene: ${splatFile.name}`);

  return reconstruction;
}
