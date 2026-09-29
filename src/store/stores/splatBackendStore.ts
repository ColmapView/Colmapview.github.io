import { create } from 'zustand';
import {
  DEFAULT_SPLAT_BACKEND_AVAILABILITY,
  DEFAULT_SPLAT_METRIC_AVAILABILITY,
  getBrowserWebGpuCompatibilityBlockReason,
  getBrowserWebGpuBackendState,
  getBrowserWebGpuMetricState,
  getInitialSplatBackendPreference,
  resolveSplatBackend,
  resolveSplatMetricCapability,
  type SplatBackendAvailability,
  type SplatBackendPreference,
  type SplatBackendResolution,
  type SplatMetricAvailability,
  type SplatMetricCapability,
  type WebGpuSplatBackendState,
  type WebGpuSplatMetricState,
} from '../../utils/splatBackendPolicy';
import type { SplatRendererRequirement } from '../../utils/splatFilePolicy';

export interface SplatBackendState {
  requestedBackend: SplatBackendPreference;
  availability: SplatBackendAvailability;
  resolution: SplatBackendResolution;
  metricAvailability: SplatMetricAvailability;
  metricCapability: SplatMetricCapability;
  setRequestedBackend: (requestedBackend: SplatBackendPreference) => void;
  setWebGpuBackendState: (webGpu: WebGpuSplatBackendState, failureReason?: string | null) => void;
  setWebGpuMetricState: (webGpu: WebGpuSplatMetricState, failureReason?: string | null) => void;
  setSparkBackendAvailable: (spark: boolean) => void;
  /**
   * Records that the Spark module download ended in failure. Distinct from
   * setSparkBackendAvailable(false), which only says "not loaded" and is a
   * no-op while spark is already false — the state that used to leave the
   * preload pending for the rest of the session.
   */
  setSparkPreloadFailed: () => void;
  setActiveSplatRenderer: (activeSplatRenderer: SplatRendererRequirement) => void;
  resetSplatBackendState: () => void;
}

function createInitialSplatBackendState(): Pick<
  SplatBackendState,
  'requestedBackend' | 'availability' | 'resolution' | 'metricAvailability' | 'metricCapability'
> {
  const requestedBackend = getInitialSplatBackendPreference();
  const webGpuFailureReason = getBrowserWebGpuCompatibilityBlockReason();
  const availability = {
    ...DEFAULT_SPLAT_BACKEND_AVAILABILITY,
    webGpu: getBrowserWebGpuBackendState(),
    webGpuFailureReason,
  };
  const metricAvailability = {
    ...DEFAULT_SPLAT_METRIC_AVAILABILITY,
    webGpu: getBrowserWebGpuMetricState(),
    webGpuFailureReason,
  };
  const resolution = resolveSplatBackend(requestedBackend, availability);
  return {
    requestedBackend,
    availability,
    resolution,
    metricAvailability,
    metricCapability: resolveSplatMetricCapability(metricAvailability, resolution),
  };
}

function resolveNextState(
  requestedBackend: SplatBackendPreference,
  availability: SplatBackendAvailability,
  metricAvailability: SplatMetricAvailability
): Pick<
  SplatBackendState,
  'requestedBackend' | 'availability' | 'resolution' | 'metricAvailability' | 'metricCapability'
> {
  const resolution = resolveSplatBackend(requestedBackend, availability);
  return {
    requestedBackend,
    availability,
    resolution,
    metricAvailability,
    metricCapability: resolveSplatMetricCapability(metricAvailability, resolution),
  };
}

export const useSplatBackendStore = create<SplatBackendState>()((set) => ({
  ...createInitialSplatBackendState(),

  setRequestedBackend: (requestedBackend) => set((state) =>
    resolveNextState(requestedBackend, state.availability, state.metricAvailability)
  ),
  setWebGpuBackendState: (webGpu, failureReason = null) => set((state) =>
    resolveNextState(
      state.requestedBackend,
      {
        ...state.availability,
        webGpu,
        webGpuFailureReason: webGpu === 'failed' || (webGpu === 'unavailable' && failureReason)
          ? failureReason
          : null,
      },
      state.metricAvailability
    )
  ),
  setWebGpuMetricState: (webGpu, failureReason = null) => set((state) =>
    resolveNextState(
      state.requestedBackend,
      state.availability,
      {
        ...state.metricAvailability,
        webGpu,
        webGpuFailureReason: webGpu === 'failed' ? failureReason : null,
      }
    )
  ),
  setSparkBackendAvailable: (spark) => set((state) => {
    // A successful load clears any recorded failure: a retry that lands is a
    // working renderer, not a permanent outage.
    const sparkPreloadFailed = spark ? false : state.availability.sparkPreloadFailed ?? false;
    if (
      state.availability.spark === spark
      && (state.availability.sparkPreloadFailed ?? false) === sparkPreloadFailed
    ) {
      return state;
    }

    return resolveNextState(
      state.requestedBackend,
      { ...state.availability, spark, sparkPreloadFailed },
      state.metricAvailability
    );
  }),
  setSparkPreloadFailed: () => set((state) =>
    state.availability.sparkPreloadFailed
      ? state
      : resolveNextState(
        state.requestedBackend,
        { ...state.availability, sparkPreloadFailed: true },
        state.metricAvailability
      )
  ),
  setActiveSplatRenderer: (activeSplatRenderer) => set((state) =>
    (state.availability.activeSplatRenderer ?? 'any') === activeSplatRenderer
      ? state
      : resolveNextState(
        state.requestedBackend,
        { ...state.availability, activeSplatRenderer },
        state.metricAvailability
      )
  ),
  resetSplatBackendState: () => set(createInitialSplatBackendState()),
}));
