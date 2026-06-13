import type { LoadedFiles, Reconstruction, SplatFileSource } from '../types/colmap';
import { createEmptyReconstruction } from '../utils/fileClassification';
import { appLogger } from '../utils/logger';
import { getSplatLoadingProgress } from '../utils/splatLoadingProgressPolicy';

interface ProgressUpdate {
  percent: number;
  message: string;
  currentFile?: string;
}

interface RunSplatOnlyLoadOptions {
  splatFile: File;
  splatFiles: File[];
  splatFileSources: SplatFileSource[];
  mapProgress: (localPercent: number) => number;
  setUrlProgress: (progress: ProgressUpdate) => void;
  setLoadedFiles: (files: LoadedFiles) => void;
  clearSplatPsnr?: () => void;
  clearCaches: (options: { preserveZip: true }) => void;
  setReconstruction: (reconstruction: Reconstruction) => void;
  resetView: () => void;
  log?: (message: string) => void;
}

export function runSplatOnlyLoad({
  splatFile,
  splatFiles,
  splatFileSources,
  mapProgress,
  setUrlProgress,
  setLoadedFiles,
  clearSplatPsnr,
  clearCaches,
  setReconstruction,
  resetView,
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
    splatFileSources,
    databaseFile: undefined,
    rigsFile: undefined,
    framesFile: undefined,
    imageFiles: new Map(),
    hasMasks: false,
  });

  clearCaches({ preserveZip: true });

  setUrlProgress(getSplatLoadingProgress(splatFile, { startPercent: mapProgress(60) }));
  setReconstruction(reconstruction);
  resetView();

  log(`[Splats] Loaded splat-only scene: ${splatFile.name}`);

  return reconstruction;
}
