import { getSplatFileExtension } from '../../utils/splatFilePolicy';
import type {
  SplatBackendAvailability,
  SplatBackendPreference,
  SplatBackendResolution,
} from '../../utils/splatBackendPolicy';

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
  resolution: SplatBackendResolution
): boolean {
  return mounted && (visible || resolution.status !== 'resolved');
}

export function isWebGpuGaussianCloudFile(file: File): boolean {
  return getSplatFileExtension(file.name) !== null;
}
