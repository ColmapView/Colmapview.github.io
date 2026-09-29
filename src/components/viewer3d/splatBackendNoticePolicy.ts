import {
  FIREFOX_LINUX_WEBGPU_UNSUPPORTED_REASON,
  PREPARING_SPARK_FOR_FORMAT_REASON,
  PREPARING_WEBGPU_SPLAT_RENDERER_REASON,
  SPARK_FALLBACK_REASON_PREFIX,
  SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON,
  SPARK_ONLY_FORMAT_REASON,
  SPARK_ONLY_FORMAT_UNAVAILABLE_REASON,
  WEBGPU_INSECURE_CONTEXT_REASON,
  WEBGPU_SPLAT_RENDERER_FAILED_REASON,
} from '../../utils/splatBackendPolicy';
import type {
  SplatBackendPreference,
  SplatBackendResolution,
} from '../../utils/splatBackendPolicy';

export interface SplatBackendNoticeOptions {
  requestedBackend: SplatBackendPreference;
  splatFile?: Pick<File, 'name'>;
  splatBackendResolution: SplatBackendResolution;
  webGpuSplatCanvasMounted: boolean;
  /**
   * True while the Spark module download is the expected next step (the
   * preload gate fired and availability.spark has not settled). An
   * "unavailable" resolution during that window is a loading state, not an
   * outcome, and must not raise the no-renderer warning.
   */
  sparkPreloadPending: boolean;
}

export interface SplatBackendNotice {
  key: string;
  message: string;
  /**
   * 'warning' = the user lost something durable (no renderer at all, or a
   * forced backend failed). 'info' = the outcome is success via fallback —
   * splats render, the message is context, and it must not persist as an
   * alarm.
   */
  severity: 'info' | 'warning';
}

const WEBGPU_FULL_FEATURES_SUGGESTION =
  'Enable WebGPU in your browser, or use a WebGPU-capable browser, for full features.';

const WEBGPU_HTTPS_SUGGESTION =
  'Reload the page over HTTPS for full features.';

const SPARK_ONLY_REASONS = new Set<string>([
  SPARK_ONLY_FORMAT_REASON,
  SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON,
  PREPARING_SPARK_FOR_FORMAT_REASON,
  SPARK_ONLY_FORMAT_UNAVAILABLE_REASON,
]);

/** SOG renders with Spark whatever was requested; the WebGPU chains below must never describe it. */
function getSparkOnlyFormatNotice({
  splatFile,
  splatBackendResolution,
  sparkPreloadPending,
}: SplatBackendNoticeOptions): SplatBackendNotice | null {
  const { reason } = splatBackendResolution;
  if (!splatFile || reason === SPARK_ONLY_FORMAT_REASON || reason === PREPARING_SPARK_FOR_FORMAT_REASON) {
    return null;
  }
  if (reason === SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON) {
    return { key: `${splatFile.name}:${reason}`, message: `${reason}.`, severity: 'info' };
  }
  // SPARK_ONLY_FORMAT_UNAVAILABLE_REASON: an outcome only once no download is in flight.
  return sparkPreloadPending
    ? null
    : { key: `${splatFile.name}:${reason}`, message: `${reason}. Reload to try again.`, severity: 'warning' };
}

export function getWebGpuSplatBackendNotice(options: SplatBackendNoticeOptions): SplatBackendNotice | null {
  if (SPARK_ONLY_REASONS.has(options.splatBackendResolution.reason)) {
    return getSparkOnlyFormatNotice(options);
  }
  // Order is presentational only: every chain below rejects on requestedBackend
  // first, and the three preferences are disjoint — and where two chains share
  // a preference ('auto', the last two), they are split by resolution status,
  // unavailable vs resolved. So no chain can shadow another, whatever the
  // order. The two forced-backend chains are kept adjacent for readability.
  return getForcedWebGpuSplatFailureNotice(options)
    ?? getForcedSparkSplatFailureNotice(options)
    ?? getAutoWebGpuUnavailableNotice(options)
    ?? getAutoSparkFallbackNotice(options);
}

/** The shared no-renderer warning the two WebGPU chains produce. */
function unavailableNotice(
  splatFile: Pick<File, 'name'>,
  splatBackendResolution: SplatBackendResolution
): SplatBackendNotice {
  return {
    key: `${splatFile.name}:${splatBackendResolution.reason}`,
    message: withWebGpuFullFeaturesSuggestion(
      `WebGPU splat renderer unavailable: ${splatBackendResolution.reason}`,
      splatBackendResolution.reason
    ),
    severity: 'warning',
  };
}

export function getForcedWebGpuSplatFailureNotice({
  requestedBackend,
  splatFile,
  splatBackendResolution,
  webGpuSplatCanvasMounted,
}: SplatBackendNoticeOptions): SplatBackendNotice | null {
  if (
    !splatFile ||
    requestedBackend !== 'webgpu' ||
    splatBackendResolution.status !== 'unavailable' ||
    webGpuSplatCanvasMounted
  ) {
    return null;
  }

  return unavailableNotice(splatFile, splatBackendResolution);
}

/**
 * The forced-Spark twin of the chain above, and the reason forcing a backend is
 * now symmetric: forcing WebGPU and failing warns, so forcing Spark and failing
 * must warn too instead of settling into an unexplained blank viewport.
 *
 * "Could not be loaded" is not a guess. resolveSplatBackend reports
 * 'unavailable' for a forced Spark request exactly when availability.spark is
 * false, and isSparkSplatRuntimePreloadPending is false there only once
 * sparkPreloadFailed is set — which nothing but a rejected Spark module preload
 * sets (all three call sites are preloadSparkModule catch handlers). It claims
 * nothing about a Spark renderer that loaded and then failed to draw; no
 * resolution models that today.
 *
 * Neither WebGPU suggestion is appended: both are WebGPU-specific advice, and
 * this user asked for Spark on purpose. The URL param is the lever they have.
 *
 * webGpuSplatCanvasMounted is deliberately unread — shouldMountWebGpuSplatCanvas
 * refuses to mount for a forced Spark request, so it is always false here.
 */
function getForcedSparkSplatFailureNotice({
  requestedBackend,
  splatFile,
  splatBackendResolution,
  sparkPreloadPending,
}: SplatBackendNoticeOptions): SplatBackendNotice | null {
  if (
    !splatFile ||
    requestedBackend !== 'spark' ||
    splatBackendResolution.status !== 'unavailable' ||
    // A download still in flight is a loading state, not an outcome; the sticky
    // preparing note owns that window, exactly as in the auto chain below.
    sparkPreloadPending
  ) {
    return null;
  }

  return {
    // Per-file, like the forced-WebGPU chain: each file's failure is its own
    // event, so a retry re-announces. The session-scoped `fallback:` key shape
    // is for environment facts, which this is not.
    key: `${splatFile.name}:${splatBackendResolution.reason}`,
    message: `${splatBackendResolution.reason}: it could not be loaded, so the splat cannot be drawn. `
      + 'Remove ?splatBackend=spark from the URL to let the app choose a renderer, or reload to try again.',
    severity: 'warning',
  };
}

function getAutoWebGpuUnavailableNotice({
  requestedBackend,
  splatFile,
  splatBackendResolution,
  sparkPreloadPending,
}: SplatBackendNoticeOptions): SplatBackendNotice | null {
  // Two loading states must stay silent, and they need separate guards:
  // sparkPreloadPending covers the Spark download window (webGpu unsupported/
  // failed, module in flight), while the reason check covers the WebGPU init
  // window (webGpu 'unavailable' with Spark already loaded), where the preload
  // gate never fires and pending is therefore false.
  if (
    !splatFile ||
    requestedBackend !== 'auto' ||
    splatBackendResolution.status !== 'unavailable' ||
    sparkPreloadPending ||
    splatBackendResolution.reason === PREPARING_WEBGPU_SPLAT_RENDERER_REASON
  ) {
    return null;
  }

  return unavailableNotice(splatFile, splatBackendResolution);
}

function getAutoSparkFallbackNotice({
  requestedBackend,
  splatFile,
  splatBackendResolution,
  webGpuSplatCanvasMounted,
}: SplatBackendNoticeOptions): SplatBackendNotice | null {
  if (
    !splatFile ||
    requestedBackend !== 'auto' ||
    splatBackendResolution.status !== 'resolved' ||
    splatBackendResolution.backend !== 'spark' ||
    webGpuSplatCanvasMounted
  ) {
    return null;
  }
  if (
    !isWebGpuUnsupportedReason(splatBackendResolution.reason) &&
    !isWebGpuRuntimeFailureReason(splatBackendResolution.reason)
  ) {
    return null;
  }

  const fallbackReason = stripSparkFallbackPrefix(splatBackendResolution.reason);
  return {
    // Keyed by reason alone: the fallback is a property of this SESSION's
    // browser environment, not of the file, so a second splat must not
    // re-announce it.
    key: `fallback:${splatBackendResolution.reason}`,
    // The wrapper skips failure-flavoured reasons entirely (see below), so one
    // call serves both fallback flavours.
    message: withWebGpuFullFeaturesSuggestion(`Using Spark fallback: ${fallbackReason}`, fallbackReason),
    severity: 'info',
  };
}

function withWebGpuFullFeaturesSuggestion(message: string, reason: string): string {
  // Failure reasons embed open-vocabulary runtime text: a driver message that
  // happens to contain "WebGPU is unsupported" must not tell a WebGPU-capable
  // machine to go install a WebGPU-capable browser. Capability advice is only
  // ever appended to reasons this policy produced itself.
  if (isWebGpuRuntimeFailureReason(reason)) {
    return message;
  }
  // The insecure-context reason gets its own advice: the browser is fine,
  // the URL scheme hid navigator.gpu — suggesting a different browser there
  // sends the user on a wild goose chase.
  if (reason.includes(WEBGPU_INSECURE_CONTEXT_REASON)) {
    return `${message}. ${WEBGPU_HTTPS_SUGGESTION}`;
  }
  return isWebGpuUnsupportedReason(reason)
    ? `${message}. ${WEBGPU_FULL_FEATURES_SUGGESTION}`
    : message;
}

function stripSparkFallbackPrefix(reason: string): string {
  return reason.startsWith(SPARK_FALLBACK_REASON_PREFIX)
    ? reason.slice(SPARK_FALLBACK_REASON_PREFIX.length)
    : reason;
}

function isWebGpuRuntimeFailureReason(reason: string): boolean {
  return reason.includes(WEBGPU_SPLAT_RENDERER_FAILED_REASON);
}

function isWebGpuUnsupportedReason(reason: string): boolean {
  const normalizedReason = reason.toLowerCase();
  // The first fragment is a deliberate catch-all over two generic literals in
  // splatBackendPolicy.ts; the specific reasons match their full exported
  // constants so a reword over there cannot silently stop these firing.
  return normalizedReason.includes('webgpu is unsupported')
    || normalizedReason.includes(FIREFOX_LINUX_WEBGPU_UNSUPPORTED_REASON.toLowerCase())
    || normalizedReason.includes(WEBGPU_INSECURE_CONTEXT_REASON.toLowerCase());
}
