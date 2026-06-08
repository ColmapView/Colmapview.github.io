export const SPLAT_BACKEND_PREFERENCES = ['auto', 'webgpu', 'spark'] as const;
export type SplatBackendPreference = typeof SPLAT_BACKEND_PREFERENCES[number];

export const SPLAT_RENDER_BACKENDS = ['webgpu', 'spark'] as const;
export type SplatRenderBackend = typeof SPLAT_RENDER_BACKENDS[number];

export type WebGpuSplatBackendState = 'unsupported' | 'unavailable' | 'ready' | 'failed';
export type WebGpuSplatMetricState = 'unsupported' | 'unavailable' | 'ready' | 'failed';

export interface SplatBackendAvailability {
  webGpu: WebGpuSplatBackendState;
  webGpuFailureReason?: string | null;
  spark: boolean;
}

export interface SplatMetricAvailability {
  webGpu: WebGpuSplatMetricState;
  webGpuFailureReason?: string | null;
}

export interface ResolvedSplatBackend {
  status: 'resolved';
  requested: SplatBackendPreference;
  backend: SplatRenderBackend;
  gpuPsnr: boolean;
  reason: string;
}

export interface UnavailableSplatBackend {
  status: 'unavailable';
  requested: SplatBackendPreference;
  backend: null;
  gpuPsnr: false;
  reason: string;
}

export type SplatBackendResolution = ResolvedSplatBackend | UnavailableSplatBackend;

export interface AvailableSplatMetricCapability {
  status: 'available';
  gpuPsnr: true;
  reason: string;
}

export interface UnavailableSplatMetricCapability {
  status: 'unavailable';
  gpuPsnr: false;
  reason: string;
}

export type SplatMetricCapability =
  | AvailableSplatMetricCapability
  | UnavailableSplatMetricCapability;

export const DEFAULT_SPLAT_BACKEND_AVAILABILITY: SplatBackendAvailability = {
  webGpu: 'unavailable',
  webGpuFailureReason: null,
  spark: false,
};

export const DEFAULT_SPLAT_METRIC_AVAILABILITY: SplatMetricAvailability = {
  webGpu: 'unavailable',
  webGpuFailureReason: null,
};

export function isSplatBackendPreference(value: string | null | undefined): value is SplatBackendPreference {
  return SPLAT_BACKEND_PREFERENCES.includes(value as SplatBackendPreference);
}

export function parseSplatBackendPreference(
  search: string | URLSearchParams | null | undefined
): SplatBackendPreference {
  const params = typeof search === 'string'
    ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    : search;
  const requested = params?.get('splatBackend');
  return isSplatBackendPreference(requested) ? requested : 'auto';
}

export function getInitialSplatBackendPreference(): SplatBackendPreference {
  if (typeof window === 'undefined') return 'auto';
  return parseSplatBackendPreference(window.location.search);
}

export function getBrowserWebGpuBackendState(): WebGpuSplatBackendState {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return 'unsupported';
  }

  // Capability detection alone is not enough: the renderer becomes ready only
  // after the gsplat device and pipelines initialize successfully.
  return 'unavailable';
}

export function getBrowserWebGpuMetricState(): WebGpuSplatMetricState {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return 'unsupported';
  }

  // Metric PSNR becomes ready only after the async WebGPU metric device probe
  // succeeds. Capability detection alone should not enable UI actions.
  return 'unavailable';
}

export function resolveSplatBackend(
  requested: SplatBackendPreference,
  availability: SplatBackendAvailability
): SplatBackendResolution {
  if (requested === 'spark') {
    return availability.spark
      ? {
          status: 'resolved',
          requested,
          backend: 'spark',
          gpuPsnr: false,
          reason: 'Spark renderer forced by splatBackend=spark',
        }
      : {
          status: 'unavailable',
          requested,
          backend: null,
          gpuPsnr: false,
          reason: 'Spark renderer is unavailable',
        };
  }

  if (requested === 'webgpu') {
    if (availability.webGpu === 'ready') {
      return {
        status: 'resolved',
        requested,
        backend: 'webgpu',
        gpuPsnr: true,
        reason: 'WebGPU renderer forced by splatBackend=webgpu',
      };
    }

    return {
      status: 'unavailable',
      requested,
      backend: null,
      gpuPsnr: false,
      reason: getWebGpuUnavailableReason(availability),
    };
  }

  if (availability.webGpu === 'ready') {
    return {
      status: 'resolved',
      requested,
      backend: 'webgpu',
      gpuPsnr: true,
      reason: 'WebGPU renderer selected automatically',
    };
  }

  if (
    availability.spark
    && (availability.webGpu === 'unsupported' || availability.webGpu === 'failed')
  ) {
    return {
      status: 'resolved',
      requested,
      backend: 'spark',
      gpuPsnr: false,
      reason: getAutoSparkFallbackReason(availability),
    };
  }

  return {
    status: 'unavailable',
    requested,
    backend: null,
    gpuPsnr: false,
    reason: availability.webGpu === 'unavailable'
      ? availability.webGpuFailureReason ?? 'Preparing WebGPU splat renderer'
      : availability.webGpu === 'failed'
      ? getWebGpuUnavailableReason(availability)
      : 'No splat renderer is available',
  };
}

export function shouldPreloadSparkSplatRuntime(
  requested: SplatBackendPreference,
  availability: Pick<SplatBackendAvailability, 'webGpu'>
): boolean {
  return requested === 'spark'
    || (
      requested === 'auto'
      && (availability.webGpu === 'unsupported' || availability.webGpu === 'failed')
    );
}

export function resolveSplatMetricCapability(
  availability: SplatMetricAvailability
): SplatMetricCapability {
  if (availability.webGpu === 'ready') {
    return {
      status: 'available',
      gpuPsnr: true,
      reason: 'WebGPU PSNR metric capability is ready',
    };
  }

  return {
    status: 'unavailable',
    gpuPsnr: false,
    reason: getWebGpuMetricUnavailableReason(availability),
  };
}

function getAutoSparkFallbackReason(availability: SplatBackendAvailability): string {
  switch (availability.webGpu) {
    case 'unsupported':
      return 'Spark fallback selected because WebGPU is unsupported';
    case 'failed':
      return availability.webGpuFailureReason
        ? `Spark fallback selected because WebGPU splat renderer failed to initialize: ${availability.webGpuFailureReason}`
        : 'Spark fallback selected because WebGPU splat renderer failed to initialize';
    case 'unavailable':
    case 'ready':
      return 'Spark fallback selected because WebGPU splat renderer is unavailable';
  }
}

function getWebGpuUnavailableReason(availability: SplatBackendAvailability): string {
  switch (availability.webGpu) {
    case 'unsupported':
      return 'WebGPU is unsupported in this browser';
    case 'failed':
      return availability.webGpuFailureReason
        ? `WebGPU splat renderer failed to initialize: ${availability.webGpuFailureReason}`
        : 'WebGPU splat renderer failed to initialize';
    case 'unavailable':
      return availability.webGpuFailureReason ?? 'WebGPU splat renderer is not available';
    case 'ready':
      return 'WebGPU splat renderer is available';
  }
}

function getWebGpuMetricUnavailableReason(availability: SplatMetricAvailability): string {
  switch (availability.webGpu) {
    case 'unsupported':
      return 'WebGPU is unsupported in this browser';
    case 'failed':
      return availability.webGpuFailureReason
        ? `WebGPU PSNR failed to initialize: ${availability.webGpuFailureReason}`
        : 'WebGPU PSNR failed to initialize';
    case 'unavailable':
      return 'Preparing WebGPU PSNR';
    case 'ready':
      return 'WebGPU PSNR metric capability is ready';
  }
}
