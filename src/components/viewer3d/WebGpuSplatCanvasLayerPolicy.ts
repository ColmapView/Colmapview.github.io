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

export function isWebGpuGaussianCloudFile(file: File): boolean {
  const extension = getSplatFileExtension(file.name);
  return extension === '.spz' || extension === '.ply';
}
