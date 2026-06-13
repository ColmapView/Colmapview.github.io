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

const WEBGPU_FULL_FEATURES_SUGGESTION =
  'Enable WebGPU in your browser, or use a WebGPU-capable browser, for full features.';

export function getWebGpuSplatBackendNotice(options: ForcedWebGpuSplatFailureNoticeOptions): ForcedWebGpuSplatFailureNotice | null {
  return getForcedWebGpuSplatFailureNotice(options)
    ?? getAutoWebGpuUnavailableNotice(options)
    ?? getAutoWebGpuUnsupportedSparkFallbackNotice(options)
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
    message: withWebGpuFullFeaturesSuggestion(
      `WebGPU splat renderer unavailable: ${splatBackendResolution.reason}`,
      splatBackendResolution.reason
    ),
  };
}

function getAutoWebGpuUnavailableNotice({
  requestedBackend,
  splatFile,
  splatBackendResolution,
}: ForcedWebGpuSplatFailureNoticeOptions): ForcedWebGpuSplatFailureNotice | null {
  if (
    !splatFile ||
    requestedBackend !== 'auto' ||
    splatBackendResolution.status !== 'unavailable' ||
    splatBackendResolution.reason === 'Preparing WebGPU splat renderer'
  ) {
    return null;
  }

  return {
    key: `${splatFile.name}:${splatBackendResolution.reason}`,
    message: withWebGpuFullFeaturesSuggestion(
      `WebGPU splat renderer unavailable: ${splatBackendResolution.reason}`,
      splatBackendResolution.reason
    ),
  };
}

function getAutoWebGpuUnsupportedSparkFallbackNotice({
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
    !isWebGpuUnsupportedReason(splatBackendResolution.reason)
  ) {
    return null;
  }

  const fallbackReason = splatBackendResolution.reason.replace(/^Spark fallback selected because /, '');
  return {
    key: `${splatFile.name}:${splatBackendResolution.reason}`,
    message: withWebGpuFullFeaturesSuggestion(`Using Spark fallback: ${fallbackReason}`, fallbackReason),
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

function withWebGpuFullFeaturesSuggestion(message: string, reason: string): string {
  return isWebGpuUnsupportedReason(reason)
    ? `${message}. ${WEBGPU_FULL_FEATURES_SUGGESTION}`
    : message;
}

function isWebGpuUnsupportedReason(reason: string): boolean {
  const normalizedReason = reason.toLowerCase();
  return normalizedReason.includes('webgpu is unsupported')
    || normalizedReason.includes('does not provide reliable webgpu support');
}
