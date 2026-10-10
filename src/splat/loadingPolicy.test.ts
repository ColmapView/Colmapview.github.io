import { describe, expect, it } from 'vitest';
import {
  resolveSplatBackend,
  type SplatBackendPreference,
  type WebGpuSplatBackendState,
} from '../utils/splatBackendPolicy';
import {
  canUseByteLessSplatLoader,
  getEstimatedSplatCount,
  getSplatAutoLoadDecision,
  getSplatDeviceAssessment,
  getSplatDeviceTier,
  SPLAT_AUTO_LOAD_MAX_BYTES,
  SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH,
  TOUCH_SPLAT_BYTELESS_RETENTION_MIN_BYTES,
  TOUCH_SPLAT_DISABLE_MIN_SPLATS,
  TOUCH_SPLAT_DISABLE_MIN_SPLATS_BYTELESS,
} from './loadingPolicy';

describe('getSplatAutoLoadDecision', () => {
  it('auto-loads a single candidate within the desktop budget', () => {
    expect(
      getSplatAutoLoadDecision([{ path: 'splats/scene.spz', size: 40_000_000 }], { isTouchDevice: false })
    ).toEqual({
      autoLoad: true,
      budgetBytes: SPLAT_AUTO_LOAD_MAX_BYTES,
      oversizedCandidate: null,
    });
  });

  it('declines a single candidate above the desktop budget and reports it as oversized', () => {
    const candidate = { path: 'splats/bigsur_v2.ply', size: 1_040_000_634 };

    expect(getSplatAutoLoadDecision([candidate], { isTouchDevice: false })).toEqual({
      autoLoad: false,
      budgetBytes: SPLAT_AUTO_LOAD_MAX_BYTES,
      oversizedCandidate: candidate,
    });
  });

  it('applies the stricter touch budget on touch devices', () => {
    const candidate = { path: 'splats/scene.spz', size: 60_000_000 };

    expect(getSplatAutoLoadDecision([candidate], { isTouchDevice: false }).autoLoad).toBe(true);
    expect(getSplatAutoLoadDecision([candidate], { isTouchDevice: true })).toEqual({
      autoLoad: false,
      budgetBytes: SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH,
      oversizedCandidate: candidate,
    });
  });

  it('auto-loads a single candidate with unknown size (static hosts may block HEAD)', () => {
    expect(
      getSplatAutoLoadDecision([{ path: 'scene.spz', size: 0 }], { isTouchDevice: true }).autoLoad
    ).toBe(true);
  });

  it('never auto-loads when there is not exactly one candidate', () => {
    const small = { path: 'a.spz', size: 1_000 };
    const alsoSmall = { path: 'b.spz', size: 2_000 };

    expect(getSplatAutoLoadDecision([], { isTouchDevice: false })).toEqual({
      autoLoad: false,
      budgetBytes: SPLAT_AUTO_LOAD_MAX_BYTES,
      oversizedCandidate: null,
    });
    expect(getSplatAutoLoadDecision([small, alsoSmall], { isTouchDevice: false })).toEqual({
      autoLoad: false,
      budgetBytes: SPLAT_AUTO_LOAD_MAX_BYTES,
      oversizedCandidate: null,
    });
  });
});

describe('SOG budgets', () => {
  it('estimates SOG splat counts at 10 bytes per splat', () => {
    expect(getEstimatedSplatCount({ path: 'scene.sog', size: 25_000_000 })).toBe(2_500_000);
  });

  it('auto-loads a lone SOG on touch only when its estimated count fits the device', () => {
    const decide = (size: number, isTouchDevice: boolean) =>
      getSplatAutoLoadDecision([{ path: 'scene.sog', size, splatCount: null }], { isTouchDevice }).autoLoad;
    expect(decide(25_000_000, true)).toBe(true);   // ~2.5M splats
    expect(decide(40_000_000, true)).toBe(false);  // ~4M splats: over the 3M touch ceiling despite fitting 50 MB
    expect(decide(100_000_000, false)).toBe(true); // desktop keeps the 150 MB byte budget
  });

  it('offers a mid-size SOG on touch with a warning, since only its estimated count is over the ceiling', () => {
    // 40 MB / 10 B = ~4M estimated, over the 3M ceiling, but within the 50 MB touch budget: the exact
    // meta.json count in validateSogBundle stops a truly over-limit file after download.
    expect(getSplatDeviceTier({ path: 'scene.sog', size: 40_000_000 }, { isTouchDevice: true })).toBe('hint');
    expect(getSplatDeviceAssessment({ path: 'scene.sog', size: 40_000_000 }, { isTouchDevice: true }))
      .toEqual({ tier: 'hint', hint: 'splatLimit' });
    expect(getSplatDeviceTier({ path: 'scene.sog', size: 50_000_000 }, { isTouchDevice: true })).toBe('hint');
    // Over the byte budget, or an exact count over the ceiling: still refused.
    expect(getSplatDeviceTier({ path: 'scene.sog', size: 60_000_000 }, { isTouchDevice: true })).toBe('disabled');
    expect(getSplatDeviceTier({ path: 'scene.sog', size: 40_000_000, splatCount: 3_500_000 }, { isTouchDevice: true })).toBe('disabled');
    // Under the ceiling: unchanged.
    expect(getSplatDeviceAssessment({ path: 'scene.sog', size: 25_000_000 }, { isTouchDevice: true })).toEqual({ tier: 'ok', hint: null });
    // Auto-load stays refused for the mid-size SOG.
    expect(getSplatAutoLoadDecision([{ path: 'scene.sog', size: 40_000_000, splatCount: null }], { isTouchDevice: true }).autoLoad).toBe(false);
  });

  it('keeps PLY and SPZ tiers, and desktop, unchanged by the SOG rule', () => {
    expect(getSplatDeviceTier({ path: 'scene.ply', size: 40_000_000 }, { isTouchDevice: true })).toBe('ok');
    expect(getSplatDeviceAssessment({ path: 'mid.spz', size: 55_000_000, splatCount: 2_000_000 }, { isTouchDevice: true }))
      .toEqual({ tier: 'hint', hint: 'memory' });
    expect(getSplatDeviceTier({ path: 'dense.spz', size: 48_000_000 + 16 }, { isTouchDevice: true })).toBe('disabled');
    expect(getSplatDeviceAssessment({ path: 'scene.sog', size: 60_000_000 }, { isTouchDevice: false })).toEqual({ tier: 'ok', hint: null });
    expect(getSplatDeviceTier({ path: 'scene.sog', size: 40_000_000 }, { isTouchDevice: false })).toBe('ok');
  });

  it('keeps PLY auto-load decisions unchanged on touch', () => {
    expect(getSplatAutoLoadDecision([{ path: 'scene.ply', size: 40_000_000, splatCount: null }], { isTouchDevice: true }).autoLoad).toBe(true);
  });
});

describe('getSplatDeviceTier', () => {
  it('is always ok on desktop hardware', () => {
    expect(getSplatDeviceTier({ path: 'huge.ply', size: 1_040_000_634, splatCount: 10_000_000 }, { isTouchDevice: false, byteLessLoaderAvailable: false })).toBe('ok');
    // Loader availability is irrelevant off touch hardware.
    expect(getSplatDeviceTier({ path: 'huge.ply', size: 1_040_000_634, splatCount: 10_000_000 }, { isTouchDevice: false, byteLessLoaderAvailable: true })).toBe('ok');
  });

  it('disables on touch when the known splat count exceeds the ceiling', () => {
    expect(getSplatDeviceTier({ path: 'huge.ply', size: 1_040_000_634, splatCount: 10_000_000 }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('disabled');
    expect(getSplatDeviceTier({ path: 'ok.ply', size: 200_000_000, splatCount: 1_900_000 }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('hint');
  });

  it('estimates the count from bytes per format when unknown', () => {
    // 1.04 GB PLY / 104 B -> ~10M -> disabled; 64 MB spz / 16 B = 4M -> disabled
    // under the retaining 3M ceiling; 40 MB spz / 16 B = 2.5M (<= ceiling) and
    // 40 MB <= 50 MB budget -> ok.
    expect(getEstimatedSplatCount({ path: 'huge.ply', size: 1_040_000_634 })).toBe(10_000_006);
    expect(getSplatDeviceTier({ path: 'huge.ply', size: 1_040_000_634 }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('disabled');
    expect(getSplatDeviceTier({ path: 'dense.spz', size: 64_000_000 }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('disabled');
    expect(getSplatDeviceTier({ path: 'tiles.spz', size: 40_000_000 }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('ok');
    expect(getSplatDeviceTier({ path: 'mid.spz', size: 55_000_000, splatCount: 2_000_000 }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('hint');
  });

  it('never disables on an unknown estimate', () => {
    expect(getSplatDeviceTier({ path: 'mystery.ply', size: 0 }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('ok');
    expect(getSplatDeviceTier({ path: 'mystery.ply' }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('ok');
    expect(getSplatDeviceTier({ path: 'mystery.ply' }, { isTouchDevice: true, byteLessLoaderAvailable: true })).toBe('ok');
  });

  it('raises the ceiling to 4M splats when the byte-less loader is available', () => {
    // 64 MB spz / 16 B = 4M == the raised ceiling (not >) -> no longer disabled;
    // 64 MB > 50 MB touch budget -> hint.
    expect(getSplatDeviceTier({ path: 'dense.spz', size: 64_000_000 }, { isTouchDevice: true, byteLessLoaderAvailable: true })).toBe('hint');
    // Explicit 3.5M count: over the retaining 3M ceiling, within the byte-less 4M one.
    const midCount = { path: 'big.ply', size: 364_000_000, splatCount: 3_500_000 };
    expect(getSplatDeviceTier(midCount, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('disabled');
    expect(getSplatDeviceTier(midCount, { isTouchDevice: true, byteLessLoaderAvailable: true })).toBe('hint');
    // Still far over even the raised ceiling -> disabled either way.
    expect(getSplatDeviceTier({ path: 'huge.ply', size: 1_040_000_634 }, { isTouchDevice: true, byteLessLoaderAvailable: true })).toBe('disabled');
    // Under both ceilings and under the size budget -> ok.
    expect(getSplatDeviceTier({ path: 'tiles.spz', size: 40_000_000 }, { isTouchDevice: true, byteLessLoaderAvailable: true })).toBe('ok');
  });

  it('defaults to the conservative retaining ceiling when availability is not given', () => {
    expect(getSplatDeviceTier({ path: 'dense.spz', size: 64_000_000 }, { isTouchDevice: true })).toBe('disabled');
  });
});

describe('canUseByteLessSplatLoader', () => {
  it('is available on touch with the WebGPU backend ready', () => {
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'auto', webGpuAvailability: 'ready', sparkBackendAvailable: false })).toBe(true);
    // A WebGPU-ready backend wins over a loaded Spark module, so byte-less stays on.
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'auto', webGpuAvailability: 'ready', sparkBackendAvailable: true })).toBe(true);
  });

  it('is available on fresh first load while WebGPU initializes and Spark is not yet loaded', () => {
    // Adjudicated invariant: 'ready' must NOT be required. The WebGPU canvas only
    // mounts after a splat activates, so at selection time a capable device reports
    // 'unavailable' (preparing), never 'ready'. With Spark not loaded, auto mode
    // resolves to no renderer yet (not Spark), so byte-less is safe.
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'auto', webGpuAvailability: 'unavailable', sparkBackendAvailable: false })).toBe(true);
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'webgpu', webGpuAvailability: 'unavailable', sparkBackendAvailable: false })).toBe(true);
  });

  it('is unavailable in auto mode when Spark is already loaded while WebGPU initializes', () => {
    // The finding: a prior splat rendered via Spark this session leaves the Spark
    // module loaded. In auto mode with WebGPU still 'unavailable', the resolver
    // picks Spark NOW - and the visible Spark renderer streams the placeholder's
    // (zero) bytes directly, so byte-less would render EMPTY. Must be off.
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'auto', webGpuAvailability: 'unavailable', sparkBackendAvailable: true })).toBe(false);
    // Forced WebGPU never resolves to Spark, so a loaded Spark module is irrelevant.
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'webgpu', webGpuAvailability: 'unavailable', sparkBackendAvailable: true })).toBe(true);
  });

  it('is never available on desktop (the retaining path stays)', () => {
    expect(canUseByteLessSplatLoader({ isTouchDevice: false, requestedBackend: 'auto', webGpuAvailability: 'ready', sparkBackendAvailable: false })).toBe(false);
    expect(canUseByteLessSplatLoader({ isTouchDevice: false, requestedBackend: 'webgpu', webGpuAvailability: 'unavailable', sparkBackendAvailable: false })).toBe(false);
  });

  it('is unavailable when the Spark renderer is forced (it streams splatFile bytes)', () => {
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'spark', webGpuAvailability: 'ready', sparkBackendAvailable: true })).toBe(false);
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'spark', webGpuAvailability: 'unavailable', sparkBackendAvailable: false })).toBe(false);
  });

  it('is unavailable in every WebGPU state that resolves to the Spark fallback', () => {
    // 'unsupported' (no navigator.gpu / blocked browser) and 'failed' (renderer
    // init failed) both permanently fall back to Spark, which reads the active
    // splatFile's bytes directly - a byte-less placeholder would render empty.
    // These stay off even before Spark finishes loading (spark not yet available),
    // because they can NEVER seed the WebGPU decode cache byte-less relies on.
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'auto', webGpuAvailability: 'unsupported', sparkBackendAvailable: false })).toBe(false);
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'auto', webGpuAvailability: 'failed', sparkBackendAvailable: false })).toBe(false);
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'webgpu', webGpuAvailability: 'unsupported', sparkBackendAvailable: false })).toBe(false);
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'webgpu', webGpuAvailability: 'failed', sparkBackendAvailable: false })).toBe(false);
  });

  it('never contradicts the real backend resolver: byte-less implies resolution is not Spark', () => {
    // Parity pin against resolveSplatBackend over the FULL input matrix. Byte-less
    // must never be enabled in a state whose current resolution is the Spark
    // renderer (which reads splatFile bytes directly -> empty on a placeholder).
    const touchValues = [true, false] as const;
    const backends: SplatBackendPreference[] = ['auto', 'webgpu', 'spark'];
    const webGpuStates: WebGpuSplatBackendState[] = ['unsupported', 'unavailable', 'ready', 'failed'];
    const sparkValues = [true, false] as const;

    let trueCount = 0;
    let falseCount = 0;
    for (const isTouchDevice of touchValues) {
      for (const requestedBackend of backends) {
        for (const webGpuAvailability of webGpuStates) {
          for (const sparkBackendAvailable of sparkValues) {
            const byteLess = canUseByteLessSplatLoader({
              isTouchDevice,
              requestedBackend,
              webGpuAvailability,
              sparkBackendAvailable,
            });
            if (byteLess) {
              trueCount += 1;
              const resolution = resolveSplatBackend(requestedBackend, {
                webGpu: webGpuAvailability,
                spark: sparkBackendAvailable,
              });
              expect(
                resolution.backend,
                `byte-less enabled but resolver picked Spark for ${JSON.stringify({ isTouchDevice, requestedBackend, webGpuAvailability, sparkBackendAvailable })}`
              ).not.toBe('spark');
            } else {
              falseCount += 1;
            }
          }
        }
      }
    }

    // Guard against a vacuously-always-false predicate passing the implication.
    expect(trueCount).toBeGreaterThan(0);
    expect(falseCount).toBeGreaterThan(0);
  });

  it('falls back to the conservative 3M ceiling when a loaded Spark forces byte-less off', () => {
    // Ceiling coherence: getSplatDeviceTier shares canUseByteLessSplatLoader, so
    // the spark-availability guard must also demote the raised 4M ceiling to 3M.
    const gate = { isTouchDevice: true, requestedBackend: 'auto' as const, webGpuAvailability: 'unavailable' as const };
    const byteLessWithSpark = canUseByteLessSplatLoader({ ...gate, sparkBackendAvailable: true });
    const byteLessWithoutSpark = canUseByteLessSplatLoader({ ...gate, sparkBackendAvailable: false });
    expect(byteLessWithSpark).toBe(false);
    expect(byteLessWithoutSpark).toBe(true);

    // 364 MB / 3.5M splats: over the retaining 3M ceiling, within the byte-less 4M one.
    const midCount = { path: 'big.ply', size: 364_000_000, splatCount: 3_500_000 };
    expect(getSplatDeviceTier(midCount, { isTouchDevice: true, byteLessLoaderAvailable: byteLessWithSpark })).toBe('disabled');
    expect(getSplatDeviceTier(midCount, { isTouchDevice: true, byteLessLoaderAvailable: byteLessWithoutSpark })).toBe('hint');
  });

  it('pins the splat tiering constants', () => {
    expect(TOUCH_SPLAT_DISABLE_MIN_SPLATS).toBe(3_000_000);
    expect(TOUCH_SPLAT_DISABLE_MIN_SPLATS_BYTELESS).toBe(4_000_000);
    expect(TOUCH_SPLAT_BYTELESS_RETENTION_MIN_BYTES).toBe(100_000_000);
  });
});
