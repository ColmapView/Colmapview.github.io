import { resolveSplatBackend, type SplatBackendPreference, type WebGpuSplatBackendState } from '../utils/splatBackendPolicy';
import { getSplatFileExtension, isSogSplatPath, type SplatFileExtension } from '../utils/splatFilePolicy';

export interface RemoteSplatCandidate {
  path: string;
  size: number;
  /** PLY vertex count captured during classification; absent/null = unknown. */
  splatCount?: number | null;
}

/**
 * Auto-load byte budget for a lone discovered splat. A single candidate used to
 * auto-download unconditionally, which for large tiles meant an unprompted
 * multi-GB fetch — on phones that OOM-crashes the tab into a reload loop.
 * Over-budget candidates stay in the catalog for explicit selection instead.
 */
export const SPLAT_AUTO_LOAD_MAX_BYTES = 150_000_000;

/** Stricter budget on touch devices: phone tabs get roughly a 1 GB memory cap. */
export const SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH = 50_000_000;

export interface SplatAutoLoadDecision {
  autoLoad: boolean;
  budgetBytes: number;
  /** The lone candidate that exceeded the budget (drives the skip log), or null. */
  oversizedCandidate: RemoteSplatCandidate | null;
}

export function getSplatAutoLoadDecision(
  candidates: readonly RemoteSplatCandidate[],
  { isTouchDevice }: { isTouchDevice: boolean }
): SplatAutoLoadDecision {
  const budgetBytes = isTouchDevice ? SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH : SPLAT_AUTO_LOAD_MAX_BYTES;
  if (candidates.length !== 1) {
    return { autoLoad: false, budgetBytes, oversizedCandidate: null };
  }

  const candidate = candidates[0];
  // Size 0 means unknown (e.g. HEAD blocked on a static host); keep the legacy
  // auto-load for those rather than silently hiding the only splat.
  if (candidate.size > budgetBytes) {
    return { autoLoad: false, budgetBytes, oversizedCandidate: candidate };
  }

  // SOG is 5-20x smaller per splat than PLY, so the byte budget alone would admit
  // scenes a phone cannot hold; on touch also require the estimated count to fit.
  if (isTouchDevice && isSogSplatPath(candidate.path)) {
    const estimated = getEstimatedSplatCount(candidate);
    if (estimated !== null && estimated > TOUCH_SPLAT_DISABLE_MIN_SPLATS) {
      return { autoLoad: false, budgetBytes, oversizedCandidate: candidate };
    }
  }

  return { autoLoad: true, budgetBytes, oversizedCandidate: null };
}

/**
 * Bytes-per-splat by format, for estimating the GPU-relevant splat count when
 * the exact header count is unknown. PLY: SH1 gaussian layout (26 float32 =
 * 104 B; denser SH3 files over-estimate the count, which only makes the gate
 * stricter). SPZ: compressed, ~16 B/splat.
 */
export const SPLAT_BYTES_PER_SPLAT_ESTIMATE: Record<SplatFileExtension, number> = {
  '.ply': 104,
  '.spz': 16,
  // Measured colour-only SOG (the densest case): 14.42 / 12.39 / 11.60 B per splat at
  // 10k / 100k / 500k splats; rounded down with margin because real captures compress better.
  '.sog': 10,
};

/**
 * Phone GPUs in a browser tab render roughly 1-3M gaussians; above ~3M the
 * outcome is a context loss or OOM kill, so the picker disables the row
 * instead of offering a crash. This is the conservative ceiling for the
 * byte-retaining load path (and for Spark-bound touch devices, which must
 * retain bytes - see canUseByteLessSplatLoader).
 */
export const TOUCH_SPLAT_DISABLE_MIN_SPLATS = 3_000_000;

/**
 * Raised ceiling when the byte-less loader is available: without the
 * blob+buffer coexistence of the retaining path, the same phone can hold a
 * somewhat larger decoded cloud before the tab OOMs.
 */
export const TOUCH_SPLAT_DISABLE_MIN_SPLATS_BYTELESS = 4_000_000;

/**
 * Byte-retention budget for lazily-selected remote splats on touch. Above this,
 * a WebGPU-capable touch device downloads into a single buffer, decodes from
 * bytes, and keeps only a zero-byte placeholder File (the source stays
 * re-fetchable), instead of retaining the blob alongside the decode buffer.
 */
export const TOUCH_SPLAT_BYTELESS_RETENTION_MIN_BYTES = 100_000_000;

export interface ByteLessSplatLoaderInputs {
  isTouchDevice: boolean;
  requestedBackend: SplatBackendPreference;
  webGpuAvailability: WebGpuSplatBackendState;
  /**
   * Whether the Spark renderer module is currently loaded/available (the backend
   * store's `availability.spark`) - e.g. a prior splat rendered via Spark this
   * session. In auto mode the resolver hands the file to Spark once this is true
   * AND WebGPU has settled outside the init window ('unsupported' or 'failed');
   * while WebGPU is still 'unavailable' (capable, initializing) the resolver
   * stays pending rather than naming Spark. Byte-less consults it anyway because
   * that pending window can END in 'failed', which does hand the file to Spark -
   * and Spark would meet the zero-byte placeholder.
   */
  sparkBackendAvailable: boolean;
}

/**
 * Whether the byte-less splat loader may be used: touch hardware in a backend
 * context where the seeded WebGPU decode cache will actually serve the render.
 * The Spark renderer streams `splatFile`'s bytes directly (bypassing the decode
 * cache), so a byte-less placeholder would render EMPTY on it.
 *
 * Byte-less is therefore off when:
 *  - Spark is forced (`requestedBackend === 'spark'`);
 *  - the WebGPU state permanently resolves to the Spark fallback ('unsupported',
 *    'failed') - these can never seed the decode cache, so they stay off even
 *    before Spark finishes loading (spark availability alone can't catch them);
 *  - auto mode has the Spark module loaded while WebGPU is not yet 'ready'. The
 *    resolver stays pending through that window rather than naming Spark, but
 *    the window can still END in 'failed', which hands the file to Spark - and
 *    Spark would meet the zero-byte placeholder. Byte-less asks "could Spark
 *    still read these bytes?", which is broader than the resolver's "which
 *    renderer is committed now", so it is stated directly;
 *  - the CURRENT backend resolution already picks Spark (still consulted, so
 *    any future Spark-selection path is covered without duplicating it).
 *
 * 'ready' is deliberately NOT required - the WebGPU renderer only reports ready
 * after its canvas mounts, which happens after a splat activates, so on a fresh
 * first load a capable device reports 'unavailable' (initializing) with Spark
 * not yet loaded, and byte-less must still work.
 *
 * Known accepted residual (ledgered follow-up, not handled here): a mid-session
 * WebGPU device loss flips availability to 'failed' and falls back to Spark,
 * which would meet an already-active byte-less placeholder and render empty
 * until the tile is re-selected; the fix is a Spark re-fetch from `source.url`.
 */
export function canUseByteLessSplatLoader({
  isTouchDevice,
  requestedBackend,
  webGpuAvailability,
  sparkBackendAvailable,
}: ByteLessSplatLoaderInputs): boolean {
  if (!isTouchDevice || requestedBackend === 'spark') {
    return false;
  }
  // Permanent-fallback WebGPU states never populate the byte-less decode cache,
  // so keep them off even before Spark finishes loading (the resolver would
  // report backend=null while Spark is still loading, missing this case).
  if (webGpuAvailability !== 'ready' && webGpuAvailability !== 'unavailable') {
    return false;
  }
  // Off in auto mode whenever the Spark module is already loaded and WebGPU has
  // not proven itself ready. resolveSplatBackend answers "which renderer is
  // committed RIGHT NOW", and it deliberately no longer names Spark during the
  // WebGPU-init window (it waits for 'ready'/'failed' - see
  // shouldPreloadSparkSplatRuntime). Byte-less needs the forward-looking
  // question instead - "could Spark still end up streaming these bytes?" - and
  // here it can: if that init ends in 'failed', Spark takes over and meets a
  // zero-byte placeholder, rendering EMPTY. So this condition is intentionally
  // stated directly rather than derived from the resolver.
  if (
    requestedBackend === 'auto'
    && sparkBackendAvailable
    && webGpuAvailability !== 'ready'
  ) {
    return false;
  }
  // Whatever the resolver commits to now must not be Spark either.
  const resolution = resolveSplatBackend(requestedBackend, {
    webGpu: webGpuAvailability,
    spark: sparkBackendAvailable,
  });
  return resolution.backend !== 'spark';
}

export function getEstimatedSplatCount(
  source: { path: string; size?: number; splatCount?: number | null }
): number | null {
  if (typeof source.splatCount === 'number' && source.splatCount > 0) {
    return source.splatCount;
  }
  const extension = getSplatFileExtension(source.path);
  if (!extension || !source.size || source.size <= 0) {
    return null;
  }
  return Math.floor(source.size / SPLAT_BYTES_PER_SPLAT_ESTIMATE[extension]);
}

export type SplatDeviceTier = 'ok' | 'hint' | 'disabled';

/**
 * Why a touch source is only a `hint`: over the touch byte budget ('memory'), or a
 * SOG whose size-based count estimate is over the splat ceiling ('splatLimit').
 */
export type SplatDeviceHint = 'memory' | 'splatLimit';

export interface SplatDeviceAssessment {
  tier: SplatDeviceTier;
  hint: SplatDeviceHint | null;
}

/**
 * Device tier for a splat source, and the reason behind a `hint`. On touch
 * hardware the disable ceiling depends on whether the byte-less loader can
 * serve this device (see canUseByteLessSplatLoader): 4M splats with it, the
 * conservative 3M without. `byteLessLoaderAvailable` defaults to false so any
 * caller that does not know the backend context fails safe onto the
 * conservative ceiling.
 *
 * A SOG within the touch byte budget is never disabled by its estimate alone:
 * SOG compresses far better than the conservative 10 B/splat estimate on real
 * captures, and validateSogBundle stops a truly over-limit file by its exact
 * meta.json count before Spark decodes it. It stays out of auto-load
 * (getSplatAutoLoadDecision) and is offered with a warning instead.
 */
export function getSplatDeviceAssessment(
  source: { path: string; size?: number; splatCount?: number | null },
  {
    isTouchDevice,
    byteLessLoaderAvailable = false,
  }: { isTouchDevice: boolean; byteLessLoaderAvailable?: boolean }
): SplatDeviceAssessment {
  if (!isTouchDevice) return { tier: 'ok', hint: null };

  const disableMinSplats = byteLessLoaderAvailable
    ? TOUCH_SPLAT_DISABLE_MIN_SPLATS_BYTELESS
    : TOUCH_SPLAT_DISABLE_MIN_SPLATS;
  const size = source.size ?? 0;
  const estimated = getEstimatedSplatCount(source);
  if (estimated !== null && estimated > disableMinSplats) {
    const countIsEstimate = !(typeof source.splatCount === 'number' && source.splatCount > 0);
    return isSogSplatPath(source.path) && countIsEstimate && size <= SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH
      ? { tier: 'hint', hint: 'splatLimit' }
      : { tier: 'disabled', hint: null };
  }
  return size > SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH ? { tier: 'hint', hint: 'memory' } : { tier: 'ok', hint: null };
}

export function getSplatDeviceTier(
  source: { path: string; size?: number; splatCount?: number | null },
  options: { isTouchDevice: boolean; byteLessLoaderAvailable?: boolean }
): SplatDeviceTier {
  return getSplatDeviceAssessment(source, options).tier;
}
