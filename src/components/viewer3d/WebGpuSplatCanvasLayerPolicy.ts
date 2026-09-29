import { supportsWebGpuRenderer } from '../../utils/splatFilePolicy';
import { isSparkOnlyFormatResolution } from '../../utils/splatBackendPolicy';
import type {
  SplatBackendAvailability,
  SplatBackendPreference,
  SplatBackendResolution,
} from '../../utils/splatBackendPolicy';
import type { UrlLoadProgress } from '../../types/manifest';

export function shouldRenderWebGpuSplatCanvas(
  resolution: SplatBackendResolution,
  splatFile: File | undefined,
  splatsVisible = true
): boolean {
  return Boolean(
    splatsVisible &&
    splatFile &&
    resolution.status === 'resolved' &&
    resolution.backend === 'webgpu'
  );
}

export function shouldMountWebGpuSplatCanvas(
  requestedBackend: SplatBackendPreference,
  availability: SplatBackendAvailability,
  splatFile: File | undefined
): boolean {
  return Boolean(
    splatFile &&
    isWebGpuGaussianCloudFile(splatFile) &&
    requestedBackend !== 'spark' &&
    availability.webGpu !== 'unsupported' &&
    availability.webGpu !== 'failed'
  );
}

export function shouldSyncWebGpuSplatCanvasFrame(
  mounted: boolean,
  visible: boolean,
  resolution: SplatBackendResolution,
  loading = false
): boolean {
  return mounted && (
    visible ||
    loading ||
    resolution.status !== 'resolved' ||
    resolution.backend !== 'webgpu'
  );
}

/**
 * A forced WebGPU request whose renderer is unavailable will never finish the
 * active splat's load, so its progress is cleared. A SOG is the exception: it
 * renders with Spark whatever was requested, and Spark's download reports
 * untagged progress while the resolution is still unavailable (preparing).
 */
export function shouldClearUnavailableForcedWebGpuSplatLoading(
  requestedBackend: SplatBackendPreference,
  resolution: SplatBackendResolution,
  splatFile: File | undefined,
  webGpuSplatCanvasMounted: boolean,
  progress: UrlLoadProgress | null
): boolean {
  return Boolean(
    requestedBackend === 'webgpu' &&
    splatFile &&
    !webGpuSplatCanvasMounted &&
    resolution.status === 'unavailable' &&
    !isSparkOnlyFormatResolution(resolution) &&
    progress?.currentFile === splatFile.name &&
    progress.splatRenderer !== 'spark'
  );
}

export function isWebGpuGaussianCloudFile(file: File): boolean {
  return supportsWebGpuRenderer(file.name);
}
