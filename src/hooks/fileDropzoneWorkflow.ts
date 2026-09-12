import type { ClearAllOptions } from '../cache';
import { clearAllCaches } from '../cache';
import { importConfigFile } from '../config/configuration';
import type { ReconstructionSourceType } from '../store/reconstructionStore';
import type { LoadedFiles, Reconstruction, SplatFileSource } from '../types/colmap';
import type { UrlLoadProgress } from '../types/manifest';
import { collectImageFiles, findMissingImageFiles, hasMaskFiles } from '../utils/imageFileUtils';
import {
  findColmapCameraImageFiles,
  findColmapFiles,
  findConfigFile,
  findSplatFileSources,
  hasColmapFiles,
  hasImageFiles,
} from '../utils/fileClassification';
import { classifyPlyFile, type PlyCloudKind } from '../parsers';
import type { AppLogger } from '../utils/logger';
import { appLogger } from '../utils/logger';
import { preloadSparkModule } from '../utils/sparkSplatRuntime';
import { getSplatLoadingProgress } from '../utils/splatLoadingProgressPolicy';
import { isReconstructionSnapshot, type ReconstructionSource } from '../wasm/reconstructionService';
import { getFailedImageCount } from './useAsyncImageCache';
import { getPointFilterWarning } from './fileDropzonePointFilterWarning';
import {
  logFileDropzoneDiagnostics,
  shouldSkipMissingImageDiagnosticForSource,
} from './fileDropzoneDiagnostics';
import { runImagesOnlyLoad } from './fileDropzoneImagesOnly';
import { runPointCloudOnlyLoad } from './fileDropzonePointCloudOnly';
import { runSplatOnlyLoad } from './fileDropzoneSplatOnly';
import { parseColmapFiles } from './fileDropzoneColmapParser';
import { buildColmapReconstruction } from './fileDropzoneReconstruction';
import { beginReconstructionLoad } from '../wasm/reconstructionLoadLifecycle';

type SetUrlProgress = (progress: UrlLoadProgress | null) => void;
type SetSourceInfo = {
  sourceType: ReconstructionSourceType;
  imageUrlBase: string | null;
};

type ImportConfigFile = typeof importConfigFile;
type ParseColmapFiles = typeof parseColmapFiles;
type BuildColmapReconstruction = typeof buildColmapReconstruction;
type ClearCaches = (options?: ClearAllOptions) => void;
type PreloadSplatRuntime = () => Promise<unknown>;
/**
 * Whether the Spark runtime chunk (~5MB) is worth fetching for this drop. The
 * renderer only needs it when the resolved backend is Spark, so the decision is
 * the caller's: it owns the requested backend and the live availability that
 * `shouldStartSparkSplatRuntimePreload` reads. Left unset it returns `true`,
 * because preloading a runtime that turns out to be unused only wastes
 * bandwidth, while skipping one that is needed stalls the first splat frame
 * behind the download.
 */
type ShouldPreloadSplatRuntime = () => boolean;
/**
 * Records that the chunk could not be fetched. This is chronologically the
 * FIRST of the three preload attempts in the app, so it has to report failure
 * the same way the two renderer-side ones do — otherwise the backend store
 * never learns, and the notice layer waits on a download nobody is making.
 */
type OnSplatRuntimePreloadFailed = () => void;
type ClassifyPlyFile = typeof classifyPlyFile;

interface PointCloudPlySource extends SplatFileSource {
  kind: 'point-cloud';
}

export interface FileDropzoneWorkflowDeps {
  addNotification: (type: 'info' | 'warning', message: string, duration?: number) => void;
  buildReconstruction?: BuildColmapReconstruction;
  clearSplatPsnr?: () => void;
  clearCaches?: ClearCaches;
  delay?: (ms: number) => Promise<void>;
  getFailedImageCount?: () => number;
  getLoadedFiles: () => LoadedFiles | null;
  getMinTrackLength: () => number;
  getSourceInfo: () => SetSourceInfo;
  getUrlLoading: () => boolean;
  importConfig?: ImportConfigFile;
  logger?: AppLogger;
  parseFiles?: ParseColmapFiles;
  classifyPlyFile?: ClassifyPlyFile;
  preloadSplatRuntime?: PreloadSplatRuntime;
  shouldPreloadSplatRuntime?: ShouldPreloadSplatRuntime;
  onSplatRuntimePreloadFailed?: OnSplatRuntimePreloadFailed;
  resetView: () => void;
  setDroppedFiles: (files: Map<string, File>) => void;
  setError: (error: string | null) => void;
  setLoadedFiles: (files: LoadedFiles) => void;
  setReconstruction: (reconstruction: Reconstruction) => void;
  setUrlLoading: (loading: boolean) => void;
  setUrlProgress: SetUrlProgress;
  setWasmReconstruction: (wasm: ReconstructionSource | null) => void;
}

export interface FileDropzoneWorkflowOptions {
  progressRange?: { start: number; end: number };
  replaceSplatScene?: boolean;
  throwOnError?: boolean;
  onSceneReplaced?: () => void;
}

function updateLoadedSplatFile(
  splatFile: File,
  splatFiles: File[],
  splatFileSources: SplatFileSource[],
  deps: Pick<FileDropzoneWorkflowDeps, 'addNotification' | 'clearSplatPsnr' | 'getLoadedFiles' | 'setLoadedFiles' | 'setUrlProgress'>,
  mapProgress: (localPercent: number) => number,
  log: (message: string) => void
): boolean {
  const loadedFiles = deps.getLoadedFiles();
  if (!loadedFiles) {
    return false;
  }

  deps.clearSplatPsnr?.();
  deps.setLoadedFiles({
    ...loadedFiles,
    splatFile,
    splatFiles,
    splatFileSources,
  });
  deps.setUrlProgress({
    percent: mapProgress(100),
    message: 'Splat file updated',
    currentFile: splatFile.name,
  });
  deps.addNotification('info', `Updated splat file: ${splatFile.name}`, 4000);
  log(`[Splats] Updated splat file: ${splatFile.name}`);
  return true;
}

function normalizeWorkflowOptions(
  options?: { start: number; end: number } | FileDropzoneWorkflowOptions
): FileDropzoneWorkflowOptions {
  if (!options) {
    return {};
  }

  if ('start' in options && 'end' in options) {
    return { progressRange: options };
  }

  return options;
}

function getProcessingErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function runNewSplatOnlyLoad(
  files: Map<string, File>,
  splatFile: File,
  splatFiles: File[],
  splatFileSources: SplatFileSource[],
  deps: Pick<
    FileDropzoneWorkflowDeps,
    'clearSplatPsnr'
      | 'setDroppedFiles'
      | 'setLoadedFiles'
      | 'setReconstruction'
      | 'setUrlProgress'
      | 'resetView'
  >,
  clearCaches: ClearCaches,
  mapProgress: (localPercent: number) => number,
  log: (message: string) => void
): void {
  deps.setDroppedFiles(files);
  runSplatOnlyLoad({
    splatFile,
    splatFiles,
    splatFileSources,
    mapProgress,
    setUrlProgress: deps.setUrlProgress,
    setLoadedFiles: deps.setLoadedFiles,
    clearSplatPsnr: deps.clearSplatPsnr,
    clearCaches,
    setReconstruction: deps.setReconstruction,
    resetView: deps.resetView,
    log,
  });
}

async function runNewPointCloudOnlyLoad(
  files: Map<string, File>,
  pointCloudFile: File,
  deps: Pick<
    FileDropzoneWorkflowDeps,
    'addNotification'
      | 'clearSplatPsnr'
      | 'setDroppedFiles'
      | 'setLoadedFiles'
      | 'setReconstruction'
      | 'setUrlProgress'
      | 'resetView'
  >,
  clearCaches: ClearCaches,
  mapProgress: (localPercent: number) => number,
  log: (message: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  deps.setDroppedFiles(files);
  await runPointCloudOnlyLoad({
    signal,
    pointCloudFile,
    mapProgress,
    setUrlProgress: deps.setUrlProgress,
    setLoadedFiles: deps.setLoadedFiles,
    clearSplatPsnr: deps.clearSplatPsnr,
    clearCaches,
    setReconstruction: deps.setReconstruction,
    resetView: deps.resetView,
    addNotification: deps.addNotification,
    log,
  });
}

async function splitSplatAndPointCloudPlySources(
  files: Map<string, File>,
  classify: ClassifyPlyFile
): Promise<{
  splatFileSources: SplatFileSource[];
  pointCloudPlySources: PointCloudPlySource[];
}> {
  const candidateSources = findSplatFileSources(files);
  const splatFileSources: SplatFileSource[] = [];
  const pointCloudPlySources: PointCloudPlySource[] = [];

  for (const source of candidateSources) {
    if (!source.file || !source.path.toLowerCase().endsWith('.ply')) {
      splatFileSources.push(source);
      continue;
    }

    const kind: PlyCloudKind = await classify(source.file);
    if (kind === 'point-cloud') {
      pointCloudPlySources.push({ ...source, kind });
      continue;
    }

    splatFileSources.push(source);
  }

  return { splatFileSources, pointCloudPlySources };
}

export async function processFileDropzoneFiles(
  files: Map<string, File>,
  deps: FileDropzoneWorkflowDeps,
  options?: { start: number; end: number } | FileDropzoneWorkflowOptions
): Promise<boolean> {
  const load = beginReconstructionLoad();
  let pendingSource: ReconstructionSource | null = null;
  let sourceInstalled = false;
  let keepLoadingForInitialSplat = false;
  const logger = deps.logger ?? appLogger;
  const clearCaches = deps.clearCaches ?? clearAllCaches;
  const importConfig = deps.importConfig ?? importConfigFile;
  const parseFiles = deps.parseFiles ?? parseColmapFiles;
  const buildReconstruction = deps.buildReconstruction ?? buildColmapReconstruction;
  const preloadSplatRuntime = deps.preloadSplatRuntime ?? preloadSparkModule;
  const shouldPreloadSplatRuntime = deps.shouldPreloadSplatRuntime ?? (() => true);
  const onSplatRuntimePreloadFailed = deps.onSplatRuntimePreloadFailed ?? (() => undefined);
  const classifyPly = deps.classifyPlyFile ?? classifyPlyFile;
  const getDecodeFailureCount = deps.getFailedImageCount ?? getFailedImageCount;
  const delay = deps.delay ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const {
    progressRange,
    replaceSplatScene = false,
    throwOnError = false,
    onSceneReplaced,
  } = normalizeWorkflowOptions(options);

  const pStart = progressRange?.start ?? 0;
  const pEnd = progressRange?.end ?? 100;
  const mapProgress = (localPercent: number) => Math.round(pStart + (localPercent / 100) * (pEnd - pStart));
  let sceneReplacementReported = false;
  const reportSceneReplacement = () => {
    if (sceneReplacementReported) {
      return;
    }

    sceneReplacementReported = true;
    onSceneReplaced?.();
  };
  try {
    const {
      splatFileSources,
      pointCloudPlySources,
    } = await splitSplatAndPointCloudPlySources(files, classifyPly);
    load.assertCurrent();
    const splatFiles = splatFileSources
      .map((source) => source.file)
      .filter((file): file is File => Boolean(file));
    const splatFile = splatFiles[0];
    const pointCloudFile = pointCloudPlySources[0]?.file;
    const splatRendererStartPercent = mapProgress(60);
    const handOffLoadingToSplatRenderer = () => {
      if (!splatFile) {
        return;
      }
      keepLoadingForInitialSplat = true;
      deps.setUrlProgress(getSplatLoadingProgress(splatFile, {
        startPercent: splatRendererStartPercent,
      }));
    };

    // Head start on the Spark chunk, but only when Spark is the backend that will
    // actually render this splat. Scene3D and SplatLayer gate their own preloads
    // on the same policy; an ungated one here downloaded the whole bundle for
    // WebGPU-backed splats that never touch it. This decides nothing about when
    // the splat itself loads — that stays with the handoff below.
    if (splatFile && shouldPreloadSplatRuntime()) {
      void preloadSplatRuntime().catch((error: unknown) => {
        // Report it, don't just log it: the renderer-side attempts read this
        // outcome to stop waiting on a download that will not arrive, and to
        // avoid re-requesting the 5 MB chunk the memo already gave up on.
        onSplatRuntimePreloadFailed();
        logger.warn(
          `[Splats] Failed to preload Spark runtime: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }

    if (!deps.getUrlLoading()) {
      deps.setUrlLoading(true);
      deps.setUrlProgress({ percent: mapProgress(0), message: 'Starting...' });
    }

    const configFile = findConfigFile(files);
    let configErrorMessage: string | null = null;
    if (configFile) {
      const result = await importConfig(configFile, { logErrors: true, signal: load.signal });
      load.assertCurrent();
      if (!result.applied && result.errorMessage) {
        deps.setError(result.errorMessage);
        configErrorMessage = result.errorMessage;
      }

      if (!hasColmapFiles(files) && !hasImageFiles(files)) {
        let startedNewSplatScene = false;
        if (splatFile) {
          const updatedExistingSplat = !replaceSplatScene
            && updateLoadedSplatFile(splatFile, splatFiles, splatFileSources, deps, mapProgress, logger.info);
          if (!updatedExistingSplat) {
            reportSceneReplacement();
            runNewSplatOnlyLoad(files, splatFile, splatFiles, splatFileSources, deps, clearCaches, mapProgress, logger.info);
            startedNewSplatScene = true;
          }
        } else if (pointCloudFile) {
          reportSceneReplacement();
          await runNewPointCloudOnlyLoad(files, pointCloudFile, deps, clearCaches, mapProgress, logger.info, load.signal);
          load.assertCurrent();
        }
        if (configErrorMessage && throwOnError) {
          throw new Error(configErrorMessage);
        }
        if (startedNewSplatScene && configErrorMessage === null) {
          handOffLoadingToSplatRenderer();
        }
        return configErrorMessage === null;
      }
    }

    let { camerasFile, imagesFile, points3DFile, rigsFile, framesFile } = findColmapFiles(files);
    if ((!camerasFile || !imagesFile || !points3DFile) && pointCloudFile) {
      const cameraImageFiles = findColmapCameraImageFiles(files);
      if (cameraImageFiles.camerasFile && cameraImageFiles.imagesFile) {
        camerasFile = cameraImageFiles.camerasFile;
        imagesFile = cameraImageFiles.imagesFile;
        points3DFile = pointCloudFile;
        rigsFile = cameraImageFiles.rigsFile;
        framesFile = cameraImageFiles.framesFile;
      }
    }

    deps.setUrlProgress({ percent: mapProgress(5), message: 'Scanning image files...' });
    const imageFiles = collectImageFiles(files);
    const hasMasks = hasMaskFiles(files);

    if (!camerasFile || !imagesFile || !points3DFile) {
      if (
        splatFile
        && !replaceSplatScene
        && updateLoadedSplatFile(splatFile, splatFiles, splatFileSources, deps, mapProgress, logger.info)
      ) {
        return true;
      }

      if (pointCloudFile && !splatFile) {
        reportSceneReplacement();
        await runNewPointCloudOnlyLoad(files, pointCloudFile, deps, clearCaches, mapProgress, logger.info, load.signal);
        load.assertCurrent();
        return true;
      }

      if (hasImageFiles(files)) {
        deps.setDroppedFiles(files);
        runImagesOnlyLoad({
          imageFiles,
          hasMasks,
          splatFile,
          splatFiles,
          splatFileSources,
          mapProgress,
          setUrlProgress: deps.setUrlProgress,
          setLoadedFiles: deps.setLoadedFiles,
          clearSplatPsnr: deps.clearSplatPsnr,
          clearCaches,
          setReconstruction: deps.setReconstruction,
          resetView: deps.resetView,
          addNotification: deps.addNotification,
          log: logger.info,
        });
        reportSceneReplacement();
        if (splatFile) {
          handOffLoadingToSplatRenderer();
        }
        return true;
      }

      if (splatFile) {
        reportSceneReplacement();
        runNewSplatOnlyLoad(files, splatFile, splatFiles, splatFileSources, deps, clearCaches, mapProgress, logger.info);
        handOffLoadingToSplatRenderer();
        return true;
      }

      throw new Error(
        'Missing required COLMAP files. Expected cameras.bin/txt, images.bin/txt, and points3D.bin/txt'
      );
    }

    reportSceneReplacement();
    deps.setDroppedFiles(files);

    logger.info(`Scanned ${files.size} total files, ${imageFiles.size} image lookup keys`);

    deps.clearSplatPsnr?.();
    deps.setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile,
      splatFiles,
      splatFileSources,
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
      signal: load.signal,
      onProgress: phase => {
        if (!load.signal.aborted) deps.setUrlProgress({
          percent: mapProgress(phase === 'statistics' ? 30 : phase === 'snapshot' ? 40 : 15),
          message: phase === 'statistics' ? 'Computing statistics...' : phase === 'snapshot' ? 'Preparing render snapshot...' : 'Parsing COLMAP files...',
        });
      },
    });
    pendingSource = parseResult.wasmWrapper;
    load.assertCurrent();

    deps.setUrlProgress({ percent: mapProgress(35), message: 'Computing statistics...' });

    const { reconstruction, pointCount } = await buildReconstruction({
      parseResult,
      rigsFile,
      framesFile,
      afterStatsComputed: () => {
        if (!load.signal.aborted) {
          deps.setUrlProgress({ percent: mapProgress(40), message: 'Processing rig data...' });
        }
      },
    });
    load.assertCurrent();

    // Worker messages already yield between parse/progress/snapshot delivery.
    // Keep the legacy paint opportunity only for work performed on this thread.
    if (!isReconstructionSnapshot(parseResult.wasmWrapper) || parseResult.wasmWrapper.service.mode !== 'worker') {
      await delay(200);
    }
    load.assertCurrent();

    deps.setUrlProgress(splatFile
      ? getSplatLoadingProgress(splatFile, { startPercent: splatRendererStartPercent })
      : { percent: mapProgress(95), message: 'Finalizing...' });

    clearCaches({ preserveZip: true });
    deps.setWasmReconstruction(parseResult.wasmWrapper);
    sourceInstalled = true;

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
    if (splatFile) {
      handOffLoadingToSplatRenderer();
    }
    return true;
  } catch (err) {
    if (load.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return false;
    logger.error('Error processing files:', err);
    const errorMessage = getProcessingErrorMessage(err);
    deps.setError(errorMessage);
    if (throwOnError) {
      throw err instanceof Error ? err : new Error(errorMessage);
    }
    return false;
  } finally {
    if (!sourceInstalled) pendingSource?.dispose();
    if (!keepLoadingForInitialSplat && !load.signal.aborted) {
      deps.setUrlLoading(false);
    }
    load.finish();
  }
}
