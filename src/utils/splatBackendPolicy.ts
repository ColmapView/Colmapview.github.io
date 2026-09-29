import type { SplatRendererRequirement } from './splatFilePolicy';

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
  /**
   * Terminal state for the Spark module download. `spark: false` alone cannot
   * tell "not loaded yet" from "load failed", so a failed download (offline,
   * blocked CDN, ad-blocker) would otherwise leave the preload pending
   * forever — a sticky preparing note that never clears and a no-renderer
   * warning that never fires. Set only by the preload failure paths.
   */
  sparkPreloadFailed?: boolean;
  /**
   * What the ACTIVE splat can be drawn with. 'spark-only' formats (SOG) resolve to
   * Spark and need its download whatever the WebGPU state; absent means 'any'.
   */
  activeSplatRenderer?: SplatRendererRequirement;
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
  sparkPreloadFailed: false,
  activeSplatRenderer: 'any',
};

export const DEFAULT_SPLAT_METRIC_AVAILABILITY: SplatMetricAvailability = {
  webGpu: 'unavailable',
  webGpuFailureReason: null,
};

export const FIREFOX_LINUX_WEBGPU_UNSUPPORTED_REASON =
  'Firefox on Linux does not provide reliable WebGPU support for splat rendering';

export const WEBGPU_INSECURE_CONTEXT_REASON =
  'WebGPU needs a secure (HTTPS) connection and this page was loaded over plain HTTP';

// Exported because the notice policy keys behavior off this exact string: an
// unshared literal let the two sides drift apart without any test noticing.
export const PREPARING_WEBGPU_SPLAT_RENDERER_REASON = 'Preparing WebGPU splat renderer';

// Shared with the notice policy, which keys off these exact strings.
export const SPARK_ONLY_FORMAT_REASON = 'SOG renders with Spark';
export const SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON = 'The WebGPU renderer cannot read SOG; using Spark';
export const PREPARING_SPARK_FOR_FORMAT_REASON = 'Preparing Spark renderer for SOG';
export const SPARK_ONLY_FORMAT_UNAVAILABLE_REASON = 'Spark renderer unavailable; SOG cannot be displayed';
export const SPARK_ONLY_FORMAT_METRIC_REASON = 'PSNR/SSIM needs the WebGPU renderer, which cannot read SOG';

function resolveSparkOnlySplatBackend(
  requested: SplatBackendPreference,
  availability: SplatBackendAvailability
): SplatBackendResolution {
  if (availability.spark) {
    return {
      status: 'resolved', requested, backend: 'spark', gpuPsnr: false,
      reason: requested === 'webgpu' ? SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON : SPARK_ONLY_FORMAT_REASON,
    };
  }
  return {
    status: 'unavailable', requested, backend: null, gpuPsnr: false,
    reason: availability.sparkPreloadFailed ? SPARK_ONLY_FORMAT_UNAVAILABLE_REASON : PREPARING_SPARK_FOR_FORMAT_REASON,
  };
}

// Every reason resolveSparkOnlySplatBackend produces; the one list both the
// metric gates below and the notice policy key off.
const SPARK_ONLY_FORMAT_REASONS: ReadonlySet<string> = new Set([
  SPARK_ONLY_FORMAT_REASON,
  SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON,
  PREPARING_SPARK_FOR_FORMAT_REASON,
  SPARK_ONLY_FORMAT_UNAVAILABLE_REASON,
]);

/** True for any resolution of a spark-only active splat (SOG): rendered, forced, preparing or failed. */
export function isSparkOnlyFormatResolution(resolution: SplatBackendResolution): boolean {
  return SPARK_ONLY_FORMAT_REASONS.has(resolution.reason);
}

// Both sides of the Spark fallback message share these: the reasons below
// build them, and the notice policy strips/matches them. Unshared literals let
// a producer reword silently break the strip and the notice keys at once.
export const SPARK_FALLBACK_REASON_PREFIX = 'Spark fallback selected because ';

export const WEBGPU_SPLAT_RENDERER_FAILED_REASON = 'WebGPU splat renderer failed to initialize';

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
  navigatorLike: BrowserWebGpuCompatibilityNavigator | null | undefined = getCurrentBrowserNavigator(),
  // Only an explicit `false` means insecure. jsdom and some embedded webviews
  // never define window.isSecureContext, and reading that absence as "loaded
  // over plain HTTP" hands an HTTPS page the wrong diagnosis.
  secureContext: boolean = typeof window === 'undefined' ? true : window.isSecureContext !== false
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

  // Blocklist first: these browsers cannot run splat WebGPU over HTTPS either,
  // so telling such a user to reload over HTTPS is the exact wild goose chase
  // the insecure-context branch below exists to prevent.
  if (isFirefox(userAgent) && isDesktopLinux(platform)) {
    return FIREFOX_LINUX_WEBGPU_UNSUPPORTED_REASON;
  }

  // navigator.gpu is defined only in secure contexts. On plain HTTP a fully
  // WebGPU-capable browser reports no gpu at all, so without this branch the
  // generic "unsupported" advice ("use a WebGPU-capable browser") is wrong —
  // the fix for the user is the URL scheme, not the browser.
  if (!navigatorLike.gpu && !secureContext) {
    return WEBGPU_INSECURE_CONTEXT_REASON;
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
  // A format only Spark decodes never waits on, or touches, WebGPU state.
  if (availability.activeSplatRenderer === 'spark-only') {
    return resolveSparkOnlySplatBackend(requested, availability);
  }

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

  // Spark bridges auto mode only where WebGPU cannot work. 'unavailable' is
  // capable-but-not-yet-initialized: the WebGPU canvas is already mounted for
  // that state (shouldMountWebGpuSplatCanvas) and settles on 'ready' or
  // 'failed', while the Spark runtime is deliberately not preloaded there (see
  // shouldPreloadSparkSplatRuntime). Resolving to Spark anyway would promise a
  // renderer that can never receive a module — the WebGPU canvas stops drawing
  // because the resolved backend is no longer 'webgpu', the Spark layer never
  // mounts, and the user gets a blank viewport under a "while WebGPU
  // initializes" notice that cannot come true. Wait for the real outcome.
  if (availability.spark && availability.webGpu !== 'unavailable') {
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
      ? availability.webGpuFailureReason ?? PREPARING_WEBGPU_SPLAT_RENDERER_REASON
      : availability.webGpu === 'failed'
      ? getWebGpuUnavailableReason(availability)
      : 'No splat renderer is available',
  };
}

/**
 * NEED: "is Spark the renderer this splat will be drawn with?" — a
 * forward-looking property of the backend choice alone, deliberately blind to
 * whether the module is downloaded, downloading, or unreachable. Consumers
 * outside the download path depend on exactly that — Scene3D and SplatLayer
 * ask what the renderer WILL be, and urlLoaderPolicy's byte-less loader gate
 * reasons about the same question — so its semantics must not absorb download
 * state. Two derived predicates below add that state:
 * shouldStartSparkSplatRuntimePreload (should a download begin now?) and
 * isSparkSplatRuntimePreloadPending (is one in flight?).
 *
 * A spark-only active splat (SOG) needs Spark regardless of WebGPU; resolveSplatBackend resolves it to Spark to match.
 */
export function shouldPreloadSparkSplatRuntime(
  requested: SplatBackendPreference,
  availability: Pick<SplatBackendAvailability, 'webGpu' | 'activeSplatRenderer'>
): boolean {
  // Preload only when Spark is certain to be needed: requested outright, or
  // auto on a browser where WebGPU cannot work ('unsupported') or has already
  // failed. 'unavailable' means capable-but-not-initialized — it is every
  // fresh page's state on a WebGPU machine ('ready' only arrives once a splat
  // canvas mounts), and preloading against it re-downloaded the 5 MB fallback
  // on the first drop of every session. Deliberate tradeoff: a device loss
  // AFTER a successful init now starts the Spark download cold at failure
  // time — accepted, because prefetching against a healthy WebGPU defeats
  // the gate's whole purpose.
  //
  // Second deliberate tradeoff: Spark no longer bridges the WebGPU-init
  // window even when its module happens to be loaded already (e.g. after a
  // splatBackend=spark session switches to auto). resolveSplatBackend matches
  // this by refusing to resolve 'spark' while WebGPU is 'unavailable', so the
  // two stay complements of each other; the honest state during init is
  // "preparing", not a Spark frame that the gate has no intention of feeding.
  return availability.activeSplatRenderer === 'spark-only'
    || requested === 'spark'
    || (
      requested === 'auto'
      && (availability.webGpu === 'unsupported' || availability.webGpu === 'failed')
    );
}

/**
 * START: "should a download be kicked off right now?" — the need above, minus
 * an attempt that already ended in failure. Every site that actually calls
 * preloadSparkModule must use this, because that memo drops its cached promise
 * on rejection: a second call is a second real ~5 MB request. The preload
 * effects take the whole availability object as a dependency, so any store
 * write re-runs them — including the write that records the failure — and a
 * need-only guard would let each one re-download and re-warn.
 *
 * Consequence, accepted for this wave: the failure is terminal for the page.
 * Nothing in the running app clears it — resetSplatBackendState exists but has
 * no production caller — so dropping a second splat after a failed download
 * does not retry; the user reloads. Retrying coherently needs a
 * "retrying" state the notice layer can read, which belongs with the deferred
 * resolver pending-status refactor rather than a silent re-attempt behind an
 * "unavailable" warning.
 */
export function shouldStartSparkSplatRuntimePreload(
  requested: SplatBackendPreference,
  availability: Pick<SplatBackendAvailability, 'webGpu' | 'sparkPreloadFailed' | 'activeSplatRenderer'>
): boolean {
  return shouldPreloadSparkSplatRuntime(requested, availability)
    && !availability.sparkPreloadFailed;
}

/**
 * PENDING: "is a download in flight?" — the need above, with the module
 * neither landed nor failed. The notice policy treats an "unavailable"
 * resolution in this window as a loading state rather than an outcome, so the
 * derived predicate lives here, beside the gate whose semantics it mirrors,
 * instead of being re-composed at call sites.
 *
 * The failure flag is load-bearing: without it a download that never arrives
 * keeps "pending" true forever, so the loading note stays up and the honest
 * warning stays suppressed for the rest of the session.
 */
export function isSparkSplatRuntimePreloadPending(
  requested: SplatBackendPreference,
  availability: Pick<SplatBackendAvailability, 'webGpu' | 'spark' | 'sparkPreloadFailed' | 'activeSplatRenderer'>
): boolean {
  return shouldPreloadSparkSplatRuntime(requested, availability)
    && !availability.spark
    && !availability.sparkPreloadFailed;
}

export function resolveSplatMetricCapability(
  availability: SplatMetricAvailability,
  resolution?: SplatBackendResolution
): SplatMetricCapability {
  // A SOG never reaches the WebGPU renderer, so GPU PSNR is never offered for it,
  // including while Spark is still loading or after its download failed — states
  // that would otherwise fall through to the WebGPU metric path below.
  if (resolution && isSparkOnlyFormatResolution(resolution)) {
    return resolution.status === 'resolved'
      ? { status: 'available', backend: 'spark', gpuPsnr: false, reason: SPARK_ONLY_FORMAT_METRIC_REASON }
      : { status: 'unavailable', backend: null, gpuPsnr: false, reason: SPARK_ONLY_FORMAT_METRIC_REASON };
  }

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
  hasMetricCapableCamera,
  resolution,
  metricAvailability,
  metricCapability,
}: {
  activeSplatFile?: unknown | null;
  hasMetricCapableCamera: boolean;
  resolution: SplatBackendResolution;
  metricAvailability?: SplatMetricAvailability;
  metricCapability: SplatMetricCapability;
}): boolean {
  // PSNR/SSIM can only be computed for cameras whose projection the renderer reproduces
  // (see splatMetricCapability). A dataset with no metric-capable camera can never produce a
  // metric, so don't expose the PSNR/SSIM color modes or gallery border modes for it.
  if (!hasMetricCapableCamera) {
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

  // A SOG can never produce a metric, even before Spark resolves (preparing or failed).
  if (isSparkOnlyFormatResolution(resolution)) {
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
        ? `${SPARK_FALLBACK_REASON_PREFIX}${availability.webGpuFailureReason}`
        : `${SPARK_FALLBACK_REASON_PREFIX}WebGPU is unsupported`;
    case 'failed':
      return availability.webGpuFailureReason
        ? `${SPARK_FALLBACK_REASON_PREFIX}${WEBGPU_SPLAT_RENDERER_FAILED_REASON}: ${availability.webGpuFailureReason}`
        : `${SPARK_FALLBACK_REASON_PREFIX}${WEBGPU_SPLAT_RENDERER_FAILED_REASON}`;
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
        ? `${WEBGPU_SPLAT_RENDERER_FAILED_REASON}: ${availability.webGpuFailureReason}`
        : WEBGPU_SPLAT_RENDERER_FAILED_REASON;
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
