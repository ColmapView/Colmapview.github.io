import type { ClearAllOptions } from '../cache';
import { clearAllCaches } from '../cache';
import { importConfigFile } from '../config/configuration';
import type { ReconstructionSourceType } from '../store/reconstructionStore';
import type { LoadedFiles, Reconstruction } from '../types/colmap';
import type { UrlLoadProgress } from '../types/manifest';
import { collectImageFiles, findMissingImageFiles, hasMaskFiles } from '../utils/imageFileUtils';
import {
  findColmapFiles,
  findConfigFile,
  hasColmapFiles,
  hasImageFiles,
} from '../utils/fileClassification';
import type { AppLogger } from '../utils/logger';
import { appLogger } from '../utils/logger';
import type { WasmReconstructionWrapper } from '../wasm/reconstruction';
import { getFailedImageCount } from './useAsyncImageCache';
import { getPointFilterWarning } from './fileDropzonePointFilterWarning';
import {
  logFileDropzoneDiagnostics,
  shouldSkipMissingImageDiagnosticForSource,
} from './fileDropzoneDiagnostics';
import { runImagesOnlyLoad } from './fileDropzoneImagesOnly';
import { parseColmapFiles } from './fileDropzoneColmapParser';
import { buildColmapReconstruction } from './fileDropzoneReconstruction';

type SetUrlProgress = (progress: UrlLoadProgress | null) => void;
type SetSourceInfo = {
  sourceType: ReconstructionSourceType;
  imageUrlBase: string | null;
};

type ImportConfigFile = typeof importConfigFile;
type ParseColmapFiles = typeof parseColmapFiles;
type BuildColmapReconstruction = typeof buildColmapReconstruction;
type ClearCaches = (options?: ClearAllOptions) => void;

export interface FileDropzoneWorkflowDeps {
  addNotification: (type: 'info' | 'warning', message: string, duration?: number) => void;
  buildReconstruction?: BuildColmapReconstruction;
  clearCaches?: ClearCaches;
  delay?: (ms: number) => Promise<void>;
  getFailedImageCount?: () => number;
  getMinTrackLength: () => number;
  getSourceInfo: () => SetSourceInfo;
  getUrlLoading: () => boolean;
  importConfig?: ImportConfigFile;
  logger?: AppLogger;
  parseFiles?: ParseColmapFiles;
  resetView: () => void;
  setDroppedFiles: (files: Map<string, File>) => void;
  setError: (error: string | null) => void;
  setLoadedFiles: (files: LoadedFiles) => void;
  setReconstruction: (reconstruction: Reconstruction) => void;
  setUrlLoading: (loading: boolean) => void;
  setUrlProgress: SetUrlProgress;
  setWasmReconstruction: (wasm: WasmReconstructionWrapper | null) => void;
}

export async function processFileDropzoneFiles(
  files: Map<string, File>,
  deps: FileDropzoneWorkflowDeps,
  progressRange?: { start: number; end: number }
): Promise<void> {
  const logger = deps.logger ?? appLogger;
  const clearCaches = deps.clearCaches ?? clearAllCaches;
  const importConfig = deps.importConfig ?? importConfigFile;
  const parseFiles = deps.parseFiles ?? parseColmapFiles;
  const buildReconstruction = deps.buildReconstruction ?? buildColmapReconstruction;
  const getDecodeFailureCount = deps.getFailedImageCount ?? getFailedImageCount;
  const delay = deps.delay ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));

  const pStart = progressRange?.start ?? 0;
  const pEnd = progressRange?.end ?? 100;
  const mapProgress = (localPercent: number) => Math.round(pStart + (localPercent / 100) * (pEnd - pStart));

  if (!deps.getUrlLoading()) {
    deps.setUrlLoading(true);
    deps.setUrlProgress({ percent: mapProgress(0), message: 'Starting...' });
  }

  const configFile = findConfigFile(files);
  if (configFile) {
    const result = await importConfig(configFile, { logErrors: true });
    if (!result.applied && result.errorMessage) {
      deps.setError(result.errorMessage);
    }

    if (!hasColmapFiles(files) && !hasImageFiles(files)) {
      deps.setUrlLoading(false);
      return;
    }
  }

  try {
    deps.setDroppedFiles(files);

    const { camerasFile, imagesFile, points3DFile, databaseFile, rigsFile, framesFile } = findColmapFiles(files);

    deps.setUrlProgress({ percent: mapProgress(5), message: 'Scanning image files...' });
    const imageFiles = collectImageFiles(files);
    const hasMasks = hasMaskFiles(files);

    if (!camerasFile || !imagesFile || !points3DFile) {
      if (hasImageFiles(files)) {
        runImagesOnlyLoad({
          imageFiles,
          hasMasks,
          mapProgress,
          setUrlProgress: deps.setUrlProgress,
          setLoadedFiles: deps.setLoadedFiles,
          clearCaches,
          setReconstruction: deps.setReconstruction,
          resetView: deps.resetView,
          addNotification: deps.addNotification,
          log: logger.info,
        });
        return;
      }

      throw new Error(
        'Missing required COLMAP files. Expected cameras.bin/txt, images.bin/txt, and points3D.bin/txt'
      );
    }

    logger.info(`Scanned ${files.size} total files, ${imageFiles.size} image lookup keys`);

    deps.setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      databaseFile,
      rigsFile,
      framesFile,
      imageFiles,
      hasMasks,
    });

    deps.setUrlProgress({ percent: mapProgress(10), message: 'Parsing COLMAP files...' });

    const parseResult = await parseFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      rigsFile,
      framesFile,
      addNotification: deps.addNotification,
      log: logger.info,
    });

    deps.setUrlProgress({ percent: mapProgress(35), message: 'Computing statistics...' });

    const { reconstruction, pointCount } = await buildReconstruction({
      parseResult,
      rigsFile,
      framesFile,
      afterStatsComputed: () => {
        deps.setUrlProgress({ percent: mapProgress(40), message: 'Processing rig data...' });
      },
    });

    clearCaches({ preserveZip: true });
    await delay(200);

    deps.setUrlProgress({ percent: mapProgress(95), message: 'Finalizing...' });

    if (parseResult.wasmWrapper) {
      deps.setWasmReconstruction(parseResult.wasmWrapper);
    }

    deps.setReconstruction(reconstruction);
    deps.resetView();

    logger.info(
      `Loaded: ${parseResult.cameras.size} cameras, ${parseResult.images.size} images, ${pointCount.toLocaleString()} points`
    );

    const pointFilterWarning = getPointFilterWarning({
      minTrackLength: deps.getMinTrackLength(),
      pointCount,
      wasmTrackLengths: parseResult.wasmWrapper?.getTrackLengths() ?? null,
      points3D: parseResult.wasmWrapper ? undefined : parseResult.points3D?.values(),
    });
    if (pointFilterWarning) {
      deps.addNotification('warning', pointFilterWarning.message);
    }

    const { sourceType, imageUrlBase } = deps.getSourceInfo();
    logFileDropzoneDiagnostics(
      findMissingImageFiles(parseResult.images, imageFiles),
      getDecodeFailureCount(),
      logger.warn,
      { skipMissingImageDiagnostic: shouldSkipMissingImageDiagnosticForSource({ sourceType, imageUrlBase }) }
    );
  } catch (err) {
    logger.error('Error processing files:', err);
    deps.setError(err instanceof Error ? err.message : 'Unknown error');
  } finally {
    deps.setUrlLoading(false);
  }
}
