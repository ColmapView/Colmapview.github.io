import { describe, expect, it } from 'vitest';
import {
  getForcedWebGpuSplatFailureNotice,
  getWebGpuSplatBackendNotice,
} from './splatBackendNoticePolicy';
import {
  PREPARING_SPARK_FOR_FORMAT_REASON,
  SPARK_FALLBACK_REASON_PREFIX,
  SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON,
  SPARK_ONLY_FORMAT_REASON,
  SPARK_ONLY_FORMAT_UNAVAILABLE_REASON,
  WEBGPU_INSECURE_CONTEXT_REASON,
} from '../../utils/splatBackendPolicy';
import type { SplatBackendResolution } from '../../utils/splatBackendPolicy';

const unavailableResolution: SplatBackendResolution = {
  status: 'unavailable',
  requested: 'webgpu',
  backend: null,
  gpuPsnr: false,
  reason: 'WebGPU is unsupported in this browser',
};

// The one shape resolveSplatBackend produces for a forced-Spark failure.
const forcedSparkUnavailableResolution: SplatBackendResolution = {
  status: 'unavailable',
  requested: 'spark',
  backend: null,
  gpuPsnr: false,
  reason: 'Spark renderer is unavailable',
};

const forcedSparkMessage =
  'Spark renderer is unavailable: it could not be loaded, so the splat cannot be drawn. '
  + 'Remove ?splatBackend=spark from the URL to let the app choose a renderer, or reload to try again.';

describe('splat backend notice policy', () => {
  it('creates a forced-WebGPU warning when no WebGPU canvas attempt is active', () => {
    const options = {
      requestedBackend: 'webgpu',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: unavailableResolution,
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    } as const;

    expect(getForcedWebGpuSplatFailureNotice(options)).toEqual({
      key: 'scene.spz:WebGPU is unsupported in this browser',
      message: 'WebGPU splat renderer unavailable: WebGPU is unsupported in this browser. Enable WebGPU in your browser, or use a WebGPU-capable browser, for full features.',
      severity: 'warning',
    });
    expect(getWebGpuSplatBackendNotice(options)).toEqual({
      key: 'scene.spz:WebGPU is unsupported in this browser',
      message: 'WebGPU splat renderer unavailable: WebGPU is unsupported in this browser. Enable WebGPU in your browser, or use a WebGPU-capable browser, for full features.',
      severity: 'warning',
    });
  });

  it('does not warn while forced WebGPU is still warming up on a mounted canvas', () => {
    expect(getForcedWebGpuSplatFailureNotice({
      requestedBackend: 'webgpu',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: unavailableResolution,
      webGpuSplatCanvasMounted: true,
      sparkPreloadPending: false,
    })).toBeNull();
  });

  it('does not warn without a forced unavailable WebGPU splat request', () => {
    expect(getForcedWebGpuSplatFailureNotice({
      requestedBackend: 'auto',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: unavailableResolution,
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    })).toBeNull();

    expect(getForcedWebGpuSplatFailureNotice({
      requestedBackend: 'webgpu',
      splatBackendResolution: unavailableResolution,
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    })).toBeNull();

    expect(getForcedWebGpuSplatFailureNotice({
      requestedBackend: 'webgpu',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: {
        status: 'resolved',
        requested: 'webgpu',
        backend: 'webgpu',
        gpuPsnr: true,
        reason: 'WebGPU renderer forced by splatBackend=webgpu',
      },
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    })).toBeNull();
  });

  it('warns when the forced Spark renderer never arrives', () => {
    expect(getWebGpuSplatBackendNotice({
      requestedBackend: 'spark',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: forcedSparkUnavailableResolution,
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    })).toEqual({
      key: 'scene.spz:Spark renderer is unavailable',
      message: forcedSparkMessage,
      severity: 'warning',
    });
  });

  it('stays silent while the forced Spark download is still in flight', () => {
    expect(getWebGpuSplatBackendNotice({
      requestedBackend: 'spark',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: forcedSparkUnavailableResolution,
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: true,
    })).toBeNull();
  });

  it('says nothing when the forced Spark renderer resolves, or without a file', () => {
    expect(getWebGpuSplatBackendNotice({
      requestedBackend: 'spark',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: {
        status: 'resolved',
        requested: 'spark',
        backend: 'spark',
        gpuPsnr: false,
        reason: 'Spark renderer forced by splatBackend=spark',
      },
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    })).toBeNull();

    expect(getWebGpuSplatBackendNotice({
      requestedBackend: 'spark',
      splatBackendResolution: forcedSparkUnavailableResolution,
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    })).toBeNull();
  });

  it('keys forced-Spark failures per file and never gives WebGPU advice', () => {
    const base = {
      requestedBackend: 'spark',
      splatBackendResolution: forcedSparkUnavailableResolution,
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    } as const;

    // Each file's failure is its own event, so a retry re-announces.
    const first = getWebGpuSplatBackendNotice({ ...base, splatFile: new File(['x'], 'a.spz') });
    const second = getWebGpuSplatBackendNotice({ ...base, splatFile: new File(['x'], 'b.spz') });
    expect(first!.key).not.toBe(second!.key);

    // Both WebGPU suggestions are nonsense for a user who forced Spark.
    expect(first!.message).not.toContain('WebGPU');
    expect(first!.message).not.toContain('HTTPS');
  });

  it('routes each requested backend to exactly one notice chain', () => {
    // Every chain guards on requestedBackend ('auto' | 'webgpu' | 'spark'), so
    // ordering in the wrapper cannot shadow. Prove it rather than assume it.
    const base = {
      splatFile: new File(['x'], 'scene.spz'),
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    } as const;

    expect(getWebGpuSplatBackendNotice({
      ...base,
      requestedBackend: 'webgpu',
      splatBackendResolution: unavailableResolution,
    })!.message).toContain('WebGPU splat renderer unavailable');

    expect(getWebGpuSplatBackendNotice({
      ...base,
      requestedBackend: 'auto',
      splatBackendResolution: { ...unavailableResolution, requested: 'auto' },
    })!.message).toContain('WebGPU splat renderer unavailable');

    expect(getWebGpuSplatBackendNotice({
      ...base,
      requestedBackend: 'spark',
      splatBackendResolution: forcedSparkUnavailableResolution,
    })!.message).toContain('?splatBackend=spark');
  });

  it('creates an auto-mode Spark fallback warning after WebGPU initialization fails', () => {
    const fallbackResolution: SplatBackendResolution = {
      status: 'resolved',
      requested: 'auto',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark fallback selected because WebGPU splat renderer failed to initialize: adapter lost',
    };

    expect(getWebGpuSplatBackendNotice({
      requestedBackend: 'auto',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: fallbackResolution,
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    })).toEqual({
      key: 'fallback:Spark fallback selected because WebGPU splat renderer failed to initialize: adapter lost',
      message: 'Using Spark fallback: WebGPU splat renderer failed to initialize: adapter lost',
      severity: 'info',
    });
  });

  it('creates an auto-mode Spark fallback warning when WebGPU is unsupported', () => {
    const fallbackResolution: SplatBackendResolution = {
      status: 'resolved',
      requested: 'auto',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark fallback selected because WebGPU is unsupported',
    };

    expect(getWebGpuSplatBackendNotice({
      requestedBackend: 'auto',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: fallbackResolution,
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    })).toEqual({
      key: 'fallback:Spark fallback selected because WebGPU is unsupported',
      message: 'Using Spark fallback: WebGPU is unsupported. Enable WebGPU in your browser, or use a WebGPU-capable browser, for full features.',
      severity: 'info',
    });
  });

  it('creates an auto-mode Spark fallback warning for browser-policy WebGPU blocks', () => {
    const fallbackResolution: SplatBackendResolution = {
      status: 'resolved',
      requested: 'auto',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark fallback selected because Firefox on Linux does not provide reliable WebGPU support for splat rendering',
    };

    expect(getWebGpuSplatBackendNotice({
      requestedBackend: 'auto',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: fallbackResolution,
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    })).toEqual({
      key: 'fallback:Spark fallback selected because Firefox on Linux does not provide reliable WebGPU support for splat rendering',
      message: 'Using Spark fallback: Firefox on Linux does not provide reliable WebGPU support for splat rendering. Enable WebGPU in your browser, or use a WebGPU-capable browser, for full features.',
      severity: 'info',
    });
  });

  it('does not warn while auto WebGPU is still warming up', () => {
    expect(getWebGpuSplatBackendNotice({
      requestedBackend: 'auto',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: {
        status: 'unavailable',
        requested: 'auto',
        backend: null,
        gpuPsnr: false,
        reason: 'Preparing WebGPU splat renderer',
      },
      webGpuSplatCanvasMounted: true,
      sparkPreloadPending: false,
    })).toBeNull();
  });

  it('creates an auto-mode warning when WebGPU has a concrete unavailable reason', () => {
    expect(getWebGpuSplatBackendNotice({
      requestedBackend: 'auto',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: {
        status: 'unavailable',
        requested: 'auto',
        backend: null,
        gpuPsnr: false,
        reason: 'WebGPU adapter is unavailable',
      },
      webGpuSplatCanvasMounted: true,
      sparkPreloadPending: false,
    })).toEqual({
      key: 'scene.spz:WebGPU adapter is unavailable',
      message: 'WebGPU splat renderer unavailable: WebGPU adapter is unavailable',
      severity: 'warning',
    });
  });

  it('keys fallback notices by session reason, not by splat file', () => {
    const fallbackResolution: SplatBackendResolution = {
      status: 'resolved',
      requested: 'auto',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark fallback selected because WebGPU is unsupported',
    };
    const base = {
      requestedBackend: 'auto',
      splatBackendResolution: fallbackResolution,
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    } as const;

    // The fallback is a property of the browser environment, not the file:
    // a second splat must not re-announce it.
    const first = getWebGpuSplatBackendNotice({ ...base, splatFile: new File(['x'], 'a.ply') });
    const second = getWebGpuSplatBackendNotice({ ...base, splatFile: new File(['x'], 'b.ply') });
    expect(first!.key).toBe(second!.key);

    // Forced failures stay per-file: each file's failure is its own event.
    const forcedBase = {
      requestedBackend: 'webgpu',
      splatBackendResolution: unavailableResolution,
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    } as const;
    const forcedA = getWebGpuSplatBackendNotice({ ...forcedBase, splatFile: new File(['x'], 'a.spz') });
    const forcedB = getWebGpuSplatBackendNotice({ ...forcedBase, splatFile: new File(['x'], 'b.spz') });
    expect(forcedA!.key).not.toBe(forcedB!.key);
  });

  it('suggests HTTPS, not a different browser, for the insecure-context reason', () => {
    const notice = getWebGpuSplatBackendNotice({
      requestedBackend: 'auto',
      splatFile: new File(['x'], 'scene.ply'),
      splatBackendResolution: {
        status: 'resolved',
        requested: 'auto',
        backend: 'spark',
        gpuPsnr: false,
        reason: `Spark fallback selected because ${WEBGPU_INSECURE_CONTEXT_REASON}`,
      },
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    });

    expect(notice).not.toBeNull();
    expect(notice!.message).toContain('HTTPS');
    expect(notice!.message).not.toContain('WebGPU-capable browser');
  });

  it('stays silent about "unavailable" while the Spark download is the expected next step', () => {
    const options = {
      requestedBackend: 'auto',
      splatFile: new File(['x'], 'scene.ply'),
      splatBackendResolution: {
        status: 'unavailable',
        requested: 'auto',
        backend: null,
        gpuPsnr: false,
        reason: 'No splat renderer is available',
      },
      webGpuSplatCanvasMounted: false,
    } as const;

    // Pending: the module is downloading — a loading state, not an outcome.
    expect(getWebGpuSplatBackendNotice({ ...options, sparkPreloadPending: true })).toBeNull();
    // Settled without Spark: now it IS a durable outcome and must warn.
    expect(getWebGpuSplatBackendNotice({ ...options, sparkPreloadPending: false })).not.toBeNull();
  });

  it('never appends browser-upgrade advice to open-vocabulary failure text', () => {
    // Failure reasons carry raw runtime/driver text. A driver message that
    // happens to say "WebGPU is unsupported" must not tell a WebGPU-capable
    // machine to go install a WebGPU-capable browser.
    const notice = getWebGpuSplatBackendNotice({
      requestedBackend: 'auto',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: {
        status: 'resolved',
        requested: 'auto',
        backend: 'spark',
        gpuPsnr: false,
        reason: `${SPARK_FALLBACK_REASON_PREFIX}WebGPU splat renderer failed to initialize: WebGPU is unsupported by this driver build`,
      },
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    });

    expect(notice).not.toBeNull();
    expect(notice!.message).toBe(
      'Using Spark fallback: WebGPU splat renderer failed to initialize: WebGPU is unsupported by this driver build'
    );
  });

  it('strips exactly the shared fallback prefix the policy produces', () => {
    const reason = `${SPARK_FALLBACK_REASON_PREFIX}WebGPU is unsupported`;
    const notice = getWebGpuSplatBackendNotice({
      requestedBackend: 'auto',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: {
        status: 'resolved',
        requested: 'auto',
        backend: 'spark',
        gpuPsnr: false,
        reason,
      },
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: false,
    });

    expect(notice!.message).toContain(`Using Spark fallback: ${reason.slice(SPARK_FALLBACK_REASON_PREFIX.length)}`);
    expect(notice!.key).toBe(`fallback:${reason}`);
  });

  it('never suppresses the forced-webgpu failure notice for a pending preload', () => {
    expect(getWebGpuSplatBackendNotice({
      requestedBackend: 'webgpu',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: unavailableResolution,
      webGpuSplatCanvasMounted: false,
      sparkPreloadPending: true,
    })).not.toBeNull();
  });
});

describe('spark-only (SOG) notices', () => {
  const notice = (
    requestedBackend: 'auto' | 'webgpu' | 'spark',
    resolution: SplatBackendResolution,
    sparkPreloadPending = false
  ) => getWebGpuSplatBackendNotice({
    requestedBackend, splatFile: { name: 'scene.sog' }, splatBackendResolution: resolution,
    webGpuSplatCanvasMounted: false, sparkPreloadPending,
  });
  const resolved = (requested: 'auto' | 'webgpu' | 'spark', reason: string): SplatBackendResolution =>
    ({ status: 'resolved', requested, backend: 'spark', gpuPsnr: false, reason });
  const unavailable = (requested: 'auto' | 'webgpu' | 'spark', reason: string): SplatBackendResolution =>
    ({ status: 'unavailable', requested, backend: null, gpuPsnr: false, reason });

  it('stays silent while Spark prepares or renders a SOG', () => {
    expect(notice('auto', unavailable('auto', PREPARING_SPARK_FOR_FORMAT_REASON), true)).toBeNull();
    expect(notice('webgpu', unavailable('webgpu', PREPARING_SPARK_FOR_FORMAT_REASON), true)).toBeNull();
    expect(notice('auto', resolved('auto', SPARK_ONLY_FORMAT_REASON))).toBeNull();
  });

  it('explains a forced WebGPU request that renders a SOG with Spark', () => {
    expect(notice('webgpu', resolved('webgpu', SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON)))
      .toMatchObject({ severity: 'info', message: expect.stringContaining('cannot read SOG') });
  });

  it('warns when Spark cannot load for a SOG, without WebGPU advice', () => {
    const result = notice('auto', unavailable('auto', SPARK_ONLY_FORMAT_UNAVAILABLE_REASON));
    expect(result).toMatchObject({ severity: 'warning' });
    expect(result?.message).not.toContain('WebGPU splat renderer unavailable');
  });
});
