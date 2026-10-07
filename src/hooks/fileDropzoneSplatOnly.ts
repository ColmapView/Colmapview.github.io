import type { LoadedFiles, Reconstruction, SplatFileSource } from '../types/colmap';
import { createEmptyReconstruction } from '../utils/fileClassification';
import { appLogger } from '../utils/logger';

interface ProgressUpdate {
  percent: number;
  message: string;
  currentFile?: string;
}

interface RunSplatOnlyLoadOptions {
  /** Absent when a Reload keeps None: the splats stay listed with none on screen. */
  splatFile?: File;
  splatFiles?: File[];
  splatFileSources?: SplatFileSource[];
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
  log(splatFile
    ? `[Splats] Creating splat-only scene from ${splatFile.name}`
    : '[Splats] Creating splat-only scene with no splat active');

  setUrlProgress({
    percent: mapProgress(50),
    message: 'Loading splat scene...',
    ...(splatFile ? { currentFile: splatFile.name } : {}),
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
    rigsFile: undefined,
    framesFile: undefined,
    imageFiles: new Map(),
    hasMasks: false,
  });

  clearCaches({ preserveZip: true });

  // The caller hands the splat to its renderer: only it knows whether that splat is already on screen.
  setUrlProgress({ percent: mapProgress(95), message: 'Finalizing...' });
  setReconstruction(reconstruction);
  resetView();

  log(splatFile
    ? `[Splats] Loaded splat-only scene: ${splatFile.name}`
    : '[Splats] Loaded splat-only scene with no splat active');

  return reconstruction;
}
