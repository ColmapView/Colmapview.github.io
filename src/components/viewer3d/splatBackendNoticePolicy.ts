import type {
  SplatBackendPreference,
  SplatBackendResolution,
} from '../../utils/splatBackendPolicy';

export interface ForcedWebGpuSplatFailureNoticeOptions {
  requestedBackend: SplatBackendPreference;
  splatFile?: Pick<File, 'name'>;
  splatBackendResolution: SplatBackendResolution;
  webGpuSplatCanvasMounted: boolean;
}

export interface ForcedWebGpuSplatFailureNotice {
  key: string;
  message: string;
}

export function getWebGpuSplatBackendNotice(options: ForcedWebGpuSplatFailureNoticeOptions): ForcedWebGpuSplatFailureNotice | null {
  return getForcedWebGpuSplatFailureNotice(options)
    ?? getAutoWebGpuFailureSparkFallbackNotice(options);
}

export function getForcedWebGpuSplatFailureNotice({
  requestedBackend,
  splatFile,
  splatBackendResolution,
  webGpuSplatCanvasMounted,
}: ForcedWebGpuSplatFailureNoticeOptions): ForcedWebGpuSplatFailureNotice | null {
  if (
    !splatFile ||
    requestedBackend !== 'webgpu' ||
    splatBackendResolution.status !== 'unavailable' ||
    webGpuSplatCanvasMounted
  ) {
    return null;
  }

  return {
    key: `${splatFile.name}:${splatBackendResolution.reason}`,
    message: `WebGPU splat renderer unavailable: ${splatBackendResolution.reason}`,
  };
}

function getAutoWebGpuFailureSparkFallbackNotice({
  requestedBackend,
  splatFile,
  splatBackendResolution,
  webGpuSplatCanvasMounted,
}: ForcedWebGpuSplatFailureNoticeOptions): ForcedWebGpuSplatFailureNotice | null {
  if (
    !splatFile ||
    requestedBackend !== 'auto' ||
    splatBackendResolution.status !== 'resolved' ||
    splatBackendResolution.backend !== 'spark' ||
    webGpuSplatCanvasMounted ||
    !splatBackendResolution.reason.includes('WebGPU splat renderer failed')
  ) {
    return null;
  }

  return {
    key: `${splatFile.name}:${splatBackendResolution.reason}`,
    message: `Using Spark fallback: ${splatBackendResolution.reason.replace(/^Spark fallback selected because /, '')}`,
  };
}
