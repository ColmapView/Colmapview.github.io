import type { UrlLoadProgress } from '../types/manifest';

export const SPLAT_LOADING_PROGRESS_PERCENT = 92;
export const SPLAT_LOADING_PROGRESS_MESSAGE = 'Preparing splat renderer...';
const SPLAT_PROGRESS_COMPLETE_GATE_PERCENT = 99;

export type SplatLoadingPhase =
  | 'preparingRenderer'
  | 'readingFile'
  | 'decodingFile'
  | 'packingData'
  | 'preparingUpload'
  | 'uploadingGpu'
  | 'initializingSpark'
  | 'renderingPreview'
  | 'renderingFirstFrame';

export type SplatLoadingRenderer = 'spark' | 'webgpu';

const SPLAT_PHASE_FRACTIONS: Record<SplatLoadingPhase, number> = {
  preparingRenderer: 0,
  readingFile: 0.08,
  decodingFile: 0.35,
  packingData: 0.55,
  preparingUpload: 0.65,
  uploadingGpu: 0.72,
  initializingSpark: 0.72,
  renderingPreview: 0.92,
  renderingFirstFrame: 0.97,
};

const SPLAT_PHASE_MESSAGES: Record<SplatLoadingPhase, string> = {
  preparingRenderer: SPLAT_LOADING_PROGRESS_MESSAGE,
  readingFile: 'Reading splat file...',
  decodingFile: 'Decoding splat...',
  packingData: 'Packing splat data...',
  preparingUpload: 'Preparing splat upload...',
  uploadingGpu: 'Uploading splat to GPU...',
  initializingSpark: 'Initializing splat renderer...',
  renderingPreview: 'Rendering splat preview...',
  renderingFirstFrame: 'Rendering first splat frame...',
};

interface SplatProgressOptions {
  startPercent?: number;
  renderer?: SplatLoadingRenderer;
}

interface SplatByteProgressOptions extends SplatProgressOptions {
  loadedBytes: number;
  totalBytes: number;
}

export function getSplatLoadingProgress(file: File, options: SplatProgressOptions = {}): UrlLoadProgress {
  return getSplatPhaseProgress(file, 'preparingRenderer', options);
}

export function getSplatPhaseProgress(
  file: File,
  phase: SplatLoadingPhase,
  options: SplatProgressOptions = {}
): UrlLoadProgress {
  return {
    percent: getSplatProgressPercent(SPLAT_PHASE_FRACTIONS[phase], options.startPercent),
    message: SPLAT_PHASE_MESSAGES[phase],
    currentFile: file.name,
    ...(options.renderer ? { splatRenderer: options.renderer } : {}),
  };
}

export function getSplatReadProgress(
  file: File,
  options: SplatByteProgressOptions
): UrlLoadProgress {
  return getSplatByteProgress(file, 'Reading splat file...', 0.08, 0.32, options);
}

export function getSplatUploadProgress(
  file: File,
  options: SplatByteProgressOptions
): UrlLoadProgress {
  return getSplatByteProgress(file, 'Uploading splat to GPU...', 0.72, 0.9, options);
}

export function getSplatLoadedProgress(file: File, options: Pick<SplatProgressOptions, 'renderer'> = {}): UrlLoadProgress {
  return {
    percent: 100,
    message: 'Complete',
    currentFile: file.name,
    ...(options.renderer ? { splatRenderer: options.renderer } : {}),
  };
}

export function getSplatProgressStartPercent(progress: UrlLoadProgress | null | undefined): number {
  if (!progress || !Number.isFinite(progress.percent)) {
    return SPLAT_LOADING_PROGRESS_PERCENT;
  }
  return clamp(progress.percent, 0, SPLAT_PROGRESS_COMPLETE_GATE_PERCENT - 1);
}

export function isSplatLoadingProgressForFile(
  progress: UrlLoadProgress | null | undefined,
  file: File | undefined
): boolean {
  return Boolean(
    file
      && progress
      && progress.currentFile === file.name
      && progress.percent < 100
      && progress.message.toLowerCase().includes('splat')
  );
}

export function isSplatLoadingProgressForRenderer(
  progress: UrlLoadProgress | null | undefined,
  file: File | undefined,
  renderer: SplatLoadingRenderer
): boolean {
  return isSplatLoadingProgressForFile(progress, file)
    && progress?.splatRenderer === renderer;
}

function getSplatByteProgress(
  file: File,
  message: string,
  startFraction: number,
  endFraction: number,
  options: SplatByteProgressOptions
): UrlLoadProgress {
  const ratio = options.totalBytes > 0
    ? clamp(options.loadedBytes / options.totalBytes, 0, 1)
    : 0;
  const phaseFraction = startFraction + (endFraction - startFraction) * ratio;
  return {
    percent: getSplatProgressPercent(phaseFraction, options.startPercent),
    message,
    currentFile: file.name,
    bytesLoaded: Math.max(0, Math.round(options.loadedBytes)),
    bytesTotal: Math.max(0, Math.round(options.totalBytes)),
    ...(options.renderer ? { splatRenderer: options.renderer } : {}),
  };
}

function getSplatProgressPercent(phaseFraction: number, startPercent = SPLAT_LOADING_PROGRESS_PERCENT): number {
  const start = clamp(startPercent, 0, SPLAT_PROGRESS_COMPLETE_GATE_PERCENT - 1);
  const fraction = clamp(phaseFraction, 0, 1);
  return Math.round(start + (SPLAT_PROGRESS_COMPLETE_GATE_PERCENT - start) * fraction);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
