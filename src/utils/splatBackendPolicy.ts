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
  backend: SplatRenderBackend;
  gpuPsnr: boolean;
  reason: string;
}

export interface UnavailableSplatMetricCapability {
  status: 'unavailable';
  backend: null;
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

export const FIREFOX_LINUX_WEBGPU_UNSUPPORTED_REASON =
  'Firefox on Linux does not provide reliable WebGPU support for splat rendering';

export interface BrowserWebGpuCompatibilityNavigator {
  gpu?: unknown;
  platform?: string;
  userAgent?: string;
  userAgentData?: {
    platform?: string;
  };
}

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

export function getBrowserWebGpuCompatibilityBlockReason(
  navigatorLike: BrowserWebGpuCompatibilityNavigator | null | undefined = getCurrentBrowserNavigator()
): string | null {
  if (!navigatorLike) {
    return null;
  }

  const userAgent = navigatorLike.userAgent ?? '';
  const platform = [
    navigatorLike.userAgentData?.platform,
    navigatorLike.platform,
    userAgent,
  ].filter(Boolean).join(' ');

  if (isFirefox(userAgent) && isDesktopLinux(platform)) {
    return FIREFOX_LINUX_WEBGPU_UNSUPPORTED_REASON;
  }

  return null;
}

export function getBrowserWebGpuBackendState(): WebGpuSplatBackendState {
  const browserNavigator = getCurrentBrowserNavigator();
  if (
    !browserNavigator?.gpu ||
    getBrowserWebGpuCompatibilityBlockReason(browserNavigator)
  ) {
    return 'unsupported';
  }

  // Capability detection alone is not enough: the renderer becomes ready only
  // after the gsplat device and pipelines initialize successfully.
  return 'unavailable';
}

export function getBrowserWebGpuMetricState(): WebGpuSplatMetricState {
  const browserNavigator = getCurrentBrowserNavigator();
  if (
    !browserNavigator?.gpu ||
    getBrowserWebGpuCompatibilityBlockReason(browserNavigator)
  ) {
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

  if (availability.spark) {
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
      && availability.webGpu !== 'ready'
    );
}

export function resolveSplatMetricCapability(
  availability: SplatMetricAvailability,
  resolution?: SplatBackendResolution
): SplatMetricCapability {
  if (resolution?.status === 'resolved' && resolution.backend === 'spark') {
    return {
      status: 'available',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark PSNR/SSIM metric capability is ready',
    };
  }

  if (availability.webGpu === 'ready') {
    return {
      status: 'available',
      backend: 'webgpu',
      gpuPsnr: true,
      reason: 'WebGPU PSNR metric capability is ready',
    };
  }

  return {
    status: 'unavailable',
    backend: null,
    gpuPsnr: false,
    reason: getWebGpuMetricUnavailableReason(availability),
  };
}

export function shouldExposeSplatMetricVisualizations({
  activeSplatFile,
  hasPinholeCameras,
  resolution,
  metricAvailability,
  metricCapability,
}: {
  activeSplatFile?: unknown | null;
  hasPinholeCameras: boolean;
  resolution: SplatBackendResolution;
  metricAvailability?: SplatMetricAvailability;
  metricCapability: SplatMetricCapability;
}): boolean {
  // PSNR/SSIM are computed only for pinhole-family cameras (spherical/EQUIRECTANGULAR are
  // excluded by SplatPsnrEvaluator), so a dataset with no pinhole camera can never produce a
  // metric — don't expose the PSNR/SSIM visualizations (color modes, gallery borders) for it.
  if (!hasPinholeCameras) {
    return false;
  }

  if (!activeSplatFile) {
    return false;
  }

  if (
    resolution.requested === 'spark'
    || (resolution.status === 'resolved' && resolution.backend === 'spark')
  ) {
    return false;
  }

  if (metricCapability.gpuPsnr) {
    return true;
  }

  return metricCapability.status === 'unavailable'
    && (
      metricAvailability?.webGpu === 'unavailable'
      || metricCapability.reason === 'Preparing WebGPU PSNR'
    );
}

function getAutoSparkFallbackReason(availability: SplatBackendAvailability): string {
  switch (availability.webGpu) {
    case 'unsupported':
      return availability.webGpuFailureReason
        ? `Spark fallback selected because ${availability.webGpuFailureReason}`
        : 'Spark fallback selected because WebGPU is unsupported';
    case 'failed':
      return availability.webGpuFailureReason
        ? `Spark fallback selected because WebGPU splat renderer failed to initialize: ${availability.webGpuFailureReason}`
        : 'Spark fallback selected because WebGPU splat renderer failed to initialize';
    case 'unavailable':
      return availability.webGpuFailureReason
        ? `Spark compatibility renderer active because ${availability.webGpuFailureReason}`
        : 'Spark compatibility renderer active while WebGPU initializes';
    case 'ready':
      return 'Spark compatibility renderer active';
  }
}

function getWebGpuUnavailableReason(availability: SplatBackendAvailability): string {
  switch (availability.webGpu) {
    case 'unsupported':
      return availability.webGpuFailureReason ?? 'WebGPU is unsupported in this browser';
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
      return availability.webGpuFailureReason ?? 'WebGPU is unsupported in this browser';
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

function getCurrentBrowserNavigator(): BrowserWebGpuCompatibilityNavigator | null {
  if (typeof navigator === 'undefined') {
    return null;
  }

  return navigator as BrowserWebGpuCompatibilityNavigator;
}

function isFirefox(userAgent: string): boolean {
  return /\bFirefox\/\d+/i.test(userAgent);
}

function isDesktopLinux(platform: string): boolean {
  return /(\bLinux\b|\bUbuntu\b|\bX11\b)/i.test(platform) && !/\bAndroid\b/i.test(platform);
}
