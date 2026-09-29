import { describe, expect, it } from 'vitest';
import {
  FIREFOX_LINUX_WEBGPU_UNSUPPORTED_REASON,
  PREPARING_SPARK_FOR_FORMAT_REASON,
  SPARK_FALLBACK_REASON_PREFIX,
  SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON,
  SPARK_ONLY_FORMAT_METRIC_REASON,
  SPARK_ONLY_FORMAT_REASON,
  SPARK_ONLY_FORMAT_UNAVAILABLE_REASON,
  WEBGPU_INSECURE_CONTEXT_REASON,
  getBrowserWebGpuCompatibilityBlockReason,
  isSparkOnlyFormatResolution,
  isSparkSplatRuntimePreloadPending,
  parseSplatBackendPreference,
  resolveSplatBackend,
  resolveSplatMetricCapability,
  shouldPreloadSparkSplatRuntime,
  shouldStartSparkSplatRuntimePreload,
  shouldExposeSplatMetricVisualizations,
  type SplatBackendAvailability,
  type SplatMetricAvailability,
} from './splatBackendPolicy';

describe('splat backend policy', () => {
  const sparkReady: SplatBackendAvailability = { webGpu: 'unsupported', spark: true };
  const webGpuReady: SplatBackendAvailability = { webGpu: 'ready', spark: true };

  it('parses valid backend preferences and defaults invalid values to auto', () => {
    expect(parseSplatBackendPreference('?splatBackend=webgpu')).toBe('webgpu');
    expect(parseSplatBackendPreference(new URLSearchParams('splatBackend=spark'))).toBe('spark');
    expect(parseSplatBackendPreference('?splatBackend=invalid')).toBe('auto');
    expect(parseSplatBackendPreference('')).toBe('auto');
  });

  it('selects WebGPU in auto mode when the WebGPU backend is ready', () => {
    expect(resolveSplatBackend('auto', webGpuReady)).toMatchObject({
      status: 'resolved',
      backend: 'webgpu',
      gpuPsnr: true,
    });
  });

  it('uses Spark as the auto fallback when WebGPU is unsupported', () => {
    expect(resolveSplatBackend('auto', sparkReady)).toMatchObject({
      status: 'resolved',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark fallback selected because WebGPU is unsupported',
    });
  });

  it('routes Firefox on Linux to Spark instead of probing WebGPU first', () => {
    const reason = getBrowserWebGpuCompatibilityBlockReason({
      gpu: {},
      platform: 'Linux x86_64',
      userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
    });

    expect(reason).toBe(FIREFOX_LINUX_WEBGPU_UNSUPPORTED_REASON);
    expect(resolveSplatBackend('auto', {
      webGpu: 'unsupported',
      webGpuFailureReason: reason,
      spark: true,
    })).toMatchObject({
      status: 'resolved',
      backend: 'spark',
      gpuPsnr: false,
      reason: `Spark fallback selected because ${FIREFOX_LINUX_WEBGPU_UNSUPPORTED_REASON}`,
    });
    expect(resolveSplatBackend('webgpu', {
      webGpu: 'unsupported',
      webGpuFailureReason: reason,
      spark: true,
    })).toMatchObject({
      status: 'unavailable',
      backend: null,
      reason: FIREFOX_LINUX_WEBGPU_UNSUPPORTED_REASON,
    });
  });

  it('does not block non-Linux Firefox or non-Firefox Linux browsers by user agent policy', () => {
    expect(getBrowserWebGpuCompatibilityBlockReason({
      gpu: {},
      platform: 'Win32',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
    })).toBeNull();

    expect(getBrowserWebGpuCompatibilityBlockReason({
      gpu: {},
      platform: 'Linux x86_64',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    })).toBeNull();
  });

  it('reports the Spark preload as pending only until the module lands', () => {
    // Gate fires + module absent = the window the preparing note covers.
    expect(isSparkSplatRuntimePreloadPending('auto', { webGpu: 'unsupported', spark: false })).toBe(true);
    expect(isSparkSplatRuntimePreloadPending('spark', { webGpu: 'ready', spark: false })).toBe(true);
    // Module landed: no longer pending, whatever the gate says.
    expect(isSparkSplatRuntimePreloadPending('auto', { webGpu: 'unsupported', spark: true })).toBe(false);
    // Gate never fired: nothing is pending.
    expect(isSparkSplatRuntimePreloadPending('auto', { webGpu: 'ready', spark: false })).toBe(false);
    expect(isSparkSplatRuntimePreloadPending('auto', { webGpu: 'unavailable', spark: false })).toBe(false);
  });

  it('stops reporting the Spark preload as pending once the download has failed', () => {
    // A failed download (offline, blocked CDN, ad-blocker) never sets
    // availability.spark, so without a terminal failure flag "pending" stays
    // true forever: the sticky preparing note can never be removed and the
    // honest no-renderer warning can never fire.
    expect(isSparkSplatRuntimePreloadPending('auto', {
      webGpu: 'unsupported',
      spark: false,
      sparkPreloadFailed: true,
    })).toBe(false);
    expect(isSparkSplatRuntimePreloadPending('spark', {
      webGpu: 'ready',
      spark: false,
      sparkPreloadFailed: true,
    })).toBe(false);
  });

  it('separates needing Spark from starting another download of it', () => {
    // NEED stays blind to download state — the byte-less loader gate asks what
    // the renderer WILL be, so a failed download must not change its answer.
    expect(shouldPreloadSparkSplatRuntime('spark', {
      webGpu: 'ready',
      sparkPreloadFailed: true,
    })).toBe(true);
    // START refuses to re-request the chunk: preloadSparkModule drops its memo
    // on rejection, so a second call is a second real ~5 MB download.
    expect(shouldStartSparkSplatRuntimePreload('spark', { webGpu: 'ready' })).toBe(true);
    expect(shouldStartSparkSplatRuntimePreload('spark', {
      webGpu: 'ready',
      sparkPreloadFailed: true,
    })).toBe(false);
    expect(shouldStartSparkSplatRuntimePreload('auto', {
      webGpu: 'unsupported',
      sparkPreloadFailed: true,
    })).toBe(false);
    // No need in the first place is still no start.
    expect(shouldStartSparkSplatRuntimePreload('auto', { webGpu: 'unavailable' })).toBe(false);
  });

  it('builds Spark fallback reasons from the prefix the notice layer strips', () => {
    // Producer and consumer share one constant: a reword on either side used
    // to break the strip and the notice keys with no test noticing.
    expect(resolveSplatBackend('auto', sparkReady).reason)
      .toBe(`${SPARK_FALLBACK_REASON_PREFIX}WebGPU is unsupported`);
    expect(resolveSplatBackend('auto', { webGpu: 'failed', spark: true }).reason)
      .toBe(`${SPARK_FALLBACK_REASON_PREFIX}WebGPU splat renderer failed to initialize`);
  });

  it('names the insecure context when WebGPU is hidden by plain HTTP', () => {
    // navigator.gpu is defined only in secure contexts, so on plain HTTP a
    // fully capable browser reports no gpu at all — "use a WebGPU-capable
    // browser" is wrong advice there; the fix is the URL scheme.
    expect(getBrowserWebGpuCompatibilityBlockReason(
      {
        platform: 'iPhone',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
      },
      false
    )).toBe(WEBGPU_INSECURE_CONTEXT_REASON);
  });

  it('does not blame the connection when WebGPU exists or the context is secure', () => {
    expect(getBrowserWebGpuCompatibilityBlockReason(
      { gpu: {}, platform: 'Win32', userAgent: 'Chrome' },
      false
    )).toBeNull();

    expect(getBrowserWebGpuCompatibilityBlockReason(
      { platform: 'Win32', userAgent: 'Chrome' },
      true
    )).toBeNull();
  });

  it('treats a missing window.isSecureContext as secure', () => {
    // jsdom and some embedded webviews never define the property. Reading
    // `undefined` as "plain HTTP" mis-diagnoses an HTTPS page — and seeds the
    // wrong reason into every store-backed test in this repo.
    const original = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    Object.defineProperty(window, 'isSecureContext', { value: undefined, configurable: true });

    try {
      expect(getBrowserWebGpuCompatibilityBlockReason({
        platform: 'Win32',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0',
      })).toBeNull();
    } finally {
      if (original) {
        Object.defineProperty(window, 'isSecureContext', original);
      } else {
        Reflect.deleteProperty(window, 'isSecureContext');
      }
    }
  });

  it('prefers a block reason HTTPS cannot fix over the insecure-context advice', () => {
    // Blocklisted Firefox on Linux over plain HTTP: "reload over HTTPS" is the
    // wild goose chase the insecure branch exists to prevent, so the reason
    // that proves HTTPS will not help has to win.
    expect(getBrowserWebGpuCompatibilityBlockReason(
      {
        platform: 'Linux x86_64',
        userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
      },
      false
    )).toBe(FIREFOX_LINUX_WEBGPU_UNSUPPORTED_REASON);
  });

  it('stays pending rather than resolving Spark while auto WebGPU is still preparing', () => {
    // Even with Spark already loaded, auto must not claim a Spark frame during
    // the init window: the WebGPU canvas is mounted and stops drawing once the
    // resolved backend is not 'webgpu', while the Spark runtime is not
    // preloaded for this state — so "resolved spark" would render nothing.
    expect(resolveSplatBackend('auto', {
      webGpu: 'unavailable',
      spark: true,
    })).toMatchObject({
      status: 'unavailable',
      backend: null,
      gpuPsnr: false,
      reason: 'Preparing WebGPU splat renderer',
    });
  });

  it('preloads Spark when requested, or when auto WebGPU cannot work', () => {
    // 'unavailable' = capable browser, renderer just not initialized yet (it
    // only flips to 'ready' once a splat canvas mounts) — every fresh page on
    // a WebGPU machine reports it, so preloading here re-downloaded the 5 MB
    // fallback on the first drop of every session.
    expect(shouldPreloadSparkSplatRuntime('auto', { webGpu: 'unavailable' })).toBe(false);
    expect(shouldPreloadSparkSplatRuntime('auto', { webGpu: 'ready' })).toBe(false);
    expect(shouldPreloadSparkSplatRuntime('auto', { webGpu: 'unsupported' })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('auto', { webGpu: 'failed' })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('spark', { webGpu: 'ready' })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('webgpu', { webGpu: 'unsupported' })).toBe(false);
  });

  it('surfaces concrete auto WebGPU unavailability detail while staying pending', () => {
    expect(resolveSplatBackend('auto', {
      webGpu: 'unavailable',
      webGpuFailureReason: 'WebGPU adapter is unavailable',
      spark: true,
    })).toMatchObject({
      status: 'unavailable',
      backend: null,
      gpuPsnr: false,
      reason: 'WebGPU adapter is unavailable',
    });
  });

  it('does not silently fall back when forced WebGPU is unavailable', () => {
    expect(resolveSplatBackend('webgpu', sparkReady)).toMatchObject({
      status: 'unavailable',
      backend: null,
      gpuPsnr: false,
      reason: 'WebGPU is unsupported in this browser',
    });
  });

  it('resolves forced WebGPU only when the WebGPU backend is ready', () => {
    expect(resolveSplatBackend('webgpu', webGpuReady)).toMatchObject({
      status: 'resolved',
      requested: 'webgpu',
      backend: 'webgpu',
      gpuPsnr: true,
      reason: 'WebGPU renderer forced by splatBackend=webgpu',
    });

    expect(resolveSplatBackend('webgpu', {
      webGpu: 'unavailable',
      spark: true,
    })).toMatchObject({
      status: 'unavailable',
      requested: 'webgpu',
      backend: null,
      gpuPsnr: false,
      reason: 'WebGPU splat renderer is not available',
    });
  });

  it('uses Spark in auto mode after a WebGPU initialization failure while preserving the failure reason', () => {
    expect(resolveSplatBackend('auto', {
      webGpu: 'failed',
      webGpuFailureReason: 'adapter lost',
      spark: true,
    })).toMatchObject({
      status: 'resolved',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark fallback selected because WebGPU splat renderer failed to initialize: adapter lost',
    });
  });

  it('does not silently fall back after a forced WebGPU initialization failure', () => {
    expect(resolveSplatBackend('webgpu', { webGpu: 'failed', spark: true })).toMatchObject({
      status: 'unavailable',
      backend: null,
      reason: 'WebGPU splat renderer failed to initialize',
    });
  });

  it('honors forced Spark and reports GPU PSNR as unavailable', () => {
    expect(resolveSplatBackend('spark', webGpuReady)).toMatchObject({
      status: 'resolved',
      backend: 'spark',
      gpuPsnr: false,
    });
  });

  it('preloads Spark for forced Spark or auto fallback paths, ignoring the spark flag', () => {
    expect(shouldPreloadSparkSplatRuntime('auto', {
      webGpu: 'unsupported',
      spark: false,
    })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('spark', {
      webGpu: 'ready',
      spark: false,
    })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('auto', {
      webGpu: 'unsupported',
      spark: true,
    })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('spark', {
      webGpu: 'ready',
      spark: true,
    })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('auto', {
      webGpu: 'ready',
      spark: true,
    })).toBe(false);
    // Capable-but-not-yet-initialized is not a fallback path, whether or not
    // Spark already happens to be loaded.
    expect(shouldPreloadSparkSplatRuntime('auto', {
      webGpu: 'unavailable',
      spark: false,
    })).toBe(false);
    expect(shouldPreloadSparkSplatRuntime('auto', {
      webGpu: 'unavailable',
      spark: true,
    })).toBe(false);
  });

  it('resolves WebGPU metric PSNR capability when the visible backend is WebGPU or unknown', () => {
    const metricReady: SplatMetricAvailability = { webGpu: 'ready' };

    expect(resolveSplatMetricCapability(metricReady)).toMatchObject({
      status: 'available',
      backend: 'webgpu',
      gpuPsnr: true,
      reason: 'WebGPU PSNR metric capability is ready',
    });
  });

  it('resolves Spark CPU PSNR and SSIM capability when Spark is the visible backend', () => {
    expect(resolveSplatMetricCapability(
      { webGpu: 'unsupported' },
      {
        status: 'resolved',
        requested: 'auto',
        backend: 'spark',
        gpuPsnr: false,
        reason: 'Spark fallback selected because WebGPU is unsupported',
      }
    )).toMatchObject({
      status: 'available',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark PSNR/SSIM metric capability is ready',
    });
  });

  it('reports unsupported and failed metric PSNR capability clearly', () => {
    expect(resolveSplatMetricCapability({ webGpu: 'unsupported' })).toMatchObject({
      status: 'unavailable',
      backend: null,
      gpuPsnr: false,
      reason: 'WebGPU is unsupported in this browser',
    });

    expect(resolveSplatMetricCapability({
      webGpu: 'failed',
      webGpuFailureReason: 'adapter unavailable',
    })).toMatchObject({
      status: 'unavailable',
      backend: null,
      gpuPsnr: false,
      reason: 'WebGPU PSNR failed to initialize: adapter unavailable',
    });
  });

  it('exposes PSNR/SSIM visualizations only for WebGPU metric paths', () => {
    const activeSplatFile = { name: 'scene.spz' };
    const sparkResolution = resolveSplatBackend('spark', webGpuReady);
    const webGpuResolution = resolveSplatBackend('webgpu', webGpuReady);

    expect(shouldExposeSplatMetricVisualizations({
      activeSplatFile,
      hasMetricCapableCamera: true,
      resolution: sparkResolution,
      metricCapability: resolveSplatMetricCapability({ webGpu: 'ready' }, sparkResolution),
    })).toBe(false);

    expect(shouldExposeSplatMetricVisualizations({
      activeSplatFile,
      hasMetricCapableCamera: true,
      resolution: webGpuResolution,
      metricCapability: resolveSplatMetricCapability({ webGpu: 'ready' }, webGpuResolution),
    })).toBe(true);

    expect(shouldExposeSplatMetricVisualizations({
      activeSplatFile,
      hasMetricCapableCamera: true,
      resolution: webGpuResolution,
      metricCapability: resolveSplatMetricCapability({ webGpu: 'unavailable' }, webGpuResolution),
    })).toBe(true);

    expect(shouldExposeSplatMetricVisualizations({
      activeSplatFile: null,
      hasMetricCapableCamera: true,
      resolution: webGpuResolution,
      metricCapability: resolveSplatMetricCapability({ webGpu: 'ready' }, webGpuResolution),
    })).toBe(false);

    expect(shouldExposeSplatMetricVisualizations({
      activeSplatFile,
      hasMetricCapableCamera: true,
      resolution: resolveSplatBackend('auto', sparkReady),
      metricCapability: resolveSplatMetricCapability({ webGpu: 'unsupported' }, resolveSplatBackend('auto', sparkReady)),
    })).toBe(false);
  });

  it('hides PSNR/SSIM visualizations for a splat dataset with no metric-capable camera', () => {
    const activeSplatFile = { name: 'scene.spz' };
    const webGpuResolution = resolveSplatBackend('webgpu', webGpuReady);
    const metricCapability = resolveSplatMetricCapability({ webGpu: 'ready' }, webGpuResolution);

    // Sanity: the same WebGPU-ready config exposes the metrics when a metric-capable camera exists.
    expect(shouldExposeSplatMetricVisualizations({
      activeSplatFile,
      hasMetricCapableCamera: true,
      resolution: webGpuResolution,
      metricCapability,
    })).toBe(true);

    // A dataset with no metric-capable camera can never produce PSNR/SSIM, so the
    // visualizations must stay hidden even when WebGPU PSNR is ready.
    expect(shouldExposeSplatMetricVisualizations({
      activeSplatFile,
      hasMetricCapableCamera: false,
      resolution: webGpuResolution,
      metricCapability,
    })).toBe(false);
  });

  it('hides PSNR/SSIM visualizations when no camera is metric-capable', () => {
    const activeSplatFile = { name: 'scene.spz' };
    const webGpuResolution = resolveSplatBackend('webgpu', webGpuReady);
    const webgpuReadyInputs = {
      activeSplatFile,
      resolution: webGpuResolution,
      metricCapability: resolveSplatMetricCapability({ webGpu: 'ready' }, webGpuResolution),
    };

    expect(shouldExposeSplatMetricVisualizations({ ...webgpuReadyInputs, hasMetricCapableCamera: true })).toBe(true);
    expect(shouldExposeSplatMetricVisualizations({ ...webgpuReadyInputs, hasMetricCapableCamera: false })).toBe(false);
  });
});

describe('spark-only active splats (SOG)', () => {
  const sparkOnly = (overrides: Partial<SplatBackendAvailability> = {}): SplatBackendAvailability => ({
    webGpu: 'ready', webGpuFailureReason: null, spark: false, sparkPreloadFailed: false,
    activeSplatRenderer: 'spark-only', ...overrides,
  });

  it.each(['auto', 'webgpu', 'spark'] as const)('waits for Spark, not WebGPU, when %s is requested', (requested) => {
    expect(resolveSplatBackend(requested, sparkOnly())).toMatchObject({
      status: 'unavailable', backend: null, reason: PREPARING_SPARK_FOR_FORMAT_REASON,
    });
  });

  it('renders with Spark once it loads, explaining a forced WebGPU request', () => {
    expect(resolveSplatBackend('auto', sparkOnly({ spark: true }))).toMatchObject({
      status: 'resolved', backend: 'spark', gpuPsnr: false, reason: SPARK_ONLY_FORMAT_REASON,
    });
    expect(resolveSplatBackend('webgpu', sparkOnly({ spark: true }))).toMatchObject({
      status: 'resolved', backend: 'spark', reason: SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON,
    });
  });

  it('reports a failed Spark download as the reason SOG cannot display', () => {
    expect(resolveSplatBackend('auto', sparkOnly({ sparkPreloadFailed: true }))).toMatchObject({
      status: 'unavailable', reason: SPARK_ONLY_FORMAT_UNAVAILABLE_REASON,
    });
  });

  it.each(['unsupported', 'unavailable', 'ready', 'failed'] as const)(
    'needs, starts and awaits the Spark download whatever the WebGPU state (%s)', (webGpu) => {
      expect(shouldPreloadSparkSplatRuntime('auto', sparkOnly({ webGpu }))).toBe(true);
      expect(shouldStartSparkSplatRuntimePreload('auto', sparkOnly({ webGpu }))).toBe(true);
      expect(isSparkSplatRuntimePreloadPending('auto', sparkOnly({ webGpu }))).toBe(true);
      expect(shouldStartSparkSplatRuntimePreload('auto', sparkOnly({ webGpu, sparkPreloadFailed: true }))).toBe(false);
    });

  it('leaves PLY/SPZ routing unchanged', () => {
    expect(resolveSplatBackend('auto', sparkOnly({ activeSplatRenderer: 'any' }))).toMatchObject({ backend: 'webgpu' });
    expect(shouldPreloadSparkSplatRuntime('auto', { webGpu: 'unavailable', activeSplatRenderer: 'any' })).toBe(false);
  });

  it('explains that PSNR/SSIM is unavailable for SOG', () => {
    const resolution = resolveSplatBackend('auto', sparkOnly({ spark: true }));
    expect(resolveSplatMetricCapability({ webGpu: 'ready', webGpuFailureReason: null }, resolution))
      .toMatchObject({ gpuPsnr: false, reason: SPARK_ONLY_FORMAT_METRIC_REASON });
  });

  // Before Spark renders (still downloading, or the download failed) the resolution
  // is 'unavailable', which used to fall through to the WebGPU metric path.
  const unrenderedSogStates = [
    { state: 'preparing', overrides: {} },
    { state: 'failed', overrides: { sparkPreloadFailed: true } },
  ] as const;

  it.each(unrenderedSogStates)('never offers GPU PSNR for a $state SOG, even with WebGPU metrics ready', ({ overrides }) => {
    const resolution = resolveSplatBackend('auto', sparkOnly(overrides));
    expect(resolveSplatMetricCapability({ webGpu: 'ready' }, resolution)).toEqual({
      status: 'unavailable', backend: null, gpuPsnr: false, reason: SPARK_ONLY_FORMAT_METRIC_REASON,
    });
  });

  it.each(unrenderedSogStates)('hides PSNR/SSIM visualizations for a $state SOG but not for the same PLY', ({ overrides }) => {
    const metricAvailability: SplatMetricAvailability = { webGpu: 'ready' };
    // Computed without the resolution, so the visualization gate is tested on its own.
    const metricCapability = resolveSplatMetricCapability(metricAvailability);
    const inputs = { hasMetricCapableCamera: true, metricAvailability, metricCapability };

    expect(shouldExposeSplatMetricVisualizations({
      ...inputs,
      activeSplatFile: { name: 'scene.sog' },
      resolution: resolveSplatBackend('auto', sparkOnly(overrides)),
    })).toBe(false);
    expect(shouldExposeSplatMetricVisualizations({
      ...inputs,
      activeSplatFile: { name: 'scene.ply' },
      resolution: resolveSplatBackend('auto', sparkOnly({ ...overrides, activeSplatRenderer: 'any' })),
    })).toBe(true);
  });

  it.each([
    { reason: SPARK_ONLY_FORMAT_REASON, requested: 'auto', overrides: { spark: true } },
    { reason: SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON, requested: 'webgpu', overrides: { spark: true } },
    { reason: PREPARING_SPARK_FOR_FORMAT_REASON, requested: 'auto', overrides: {} },
    { reason: SPARK_ONLY_FORMAT_UNAVAILABLE_REASON, requested: 'auto', overrides: { sparkPreloadFailed: true } },
  ] as const)('recognises $reason as a spark-only resolution',({ reason, requested, overrides }) => {
    const resolution = resolveSplatBackend(requested, sparkOnly(overrides));
    expect(resolution.reason).toBe(reason);
    expect(isSparkOnlyFormatResolution(resolution)).toBe(true);
  });

  it('does not treat ordinary WebGPU or Spark resolutions as spark-only', () => {
    expect(isSparkOnlyFormatResolution(resolveSplatBackend('auto', { webGpu: 'ready', spark: true }))).toBe(false);
    expect(isSparkOnlyFormatResolution(resolveSplatBackend('auto', { webGpu: 'unsupported', spark: true }))).toBe(false);
    expect(isSparkOnlyFormatResolution(resolveSplatBackend('spark', { webGpu: 'ready', spark: true }))).toBe(false);
    expect(isSparkOnlyFormatResolution(resolveSplatBackend('auto', { webGpu: 'unavailable', spark: false }))).toBe(false);
  });
});
