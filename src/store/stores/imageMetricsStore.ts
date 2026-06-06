import { create } from 'zustand';
import type { ImageId } from '../../types/colmap';

export type ImageMetricStatus = 'idle' | 'pending' | 'computing' | 'ready' | 'error';
export type SplatPsnrComputeScope = 'selected' | 'all';

export interface SplatPsnrMetric {
  imageId: ImageId;
  psnr: number;
  mse: number;
  validPixelCount: number;
  width: number;
  height: number;
  computedAt: number;
  renderBackground?: SplatPsnrRenderBackground;
  diagnostics?: SplatPsnrMetricDiagnostics;
}

export type SplatPsnrRenderBackgroundLabel = 'opaque-black' | 'opaque-white';

export interface SplatPsnrRenderBackground {
  label: SplatPsnrRenderBackgroundLabel;
  rgba: [number, number, number, number];
}

export interface SplatPsnrBackgroundCandidate extends SplatPsnrRenderBackground {
  psnr: number;
  mse: number;
  validPixelCount: number;
  sumSquaredError: number;
  improvementDb: number;
}

export interface SplatPsnrBackgroundDiagnostics {
  baseline: SplatPsnrBackgroundCandidate;
  alternatives: SplatPsnrBackgroundCandidate[];
  best: SplatPsnrBackgroundCandidate;
}

export interface SplatPsnrMetricDiagnostics {
  lowPsnrThresholdDb: number;
  validPixelRatio: number;
  renderedMeanRgb: [number, number, number] | null;
  groundTruthMeanRgb: [number, number, number] | null;
  meanRgbDelta: [number, number, number] | null;
  bestOffset?: {
    maxOffsetPixels: number;
    evaluatedOffsetCount: number;
    dx: number;
    dy: number;
    psnr: number;
    mse: number;
    validPixelCount: number;
    improvementDb: number;
  };
  backgroundDiagnostics?: SplatPsnrBackgroundDiagnostics;
  backgroundMismatch: {
    classification: 'possible' | 'unlikely' | 'unknown';
    reason: string;
  };
  renderSize: {
    width: number;
    height: number;
  };
  sourceImageSize: {
    width: number;
    height: number;
  };
  cameraId: number;
  cameraModelId: number;
  imageName: string;
}

export interface SplatPsnrComputeRequest {
  id: number;
  scope: SplatPsnrComputeScope;
  selectedImageId?: ImageId | null;
}

export interface ImageMetricsState {
  splatPsnrFrameReady: boolean;
  splatPsnrMetrics: Map<ImageId, SplatPsnrMetric>;
  splatPsnrStatus: Map<ImageId, ImageMetricStatus>;
  splatPsnrError: Map<ImageId, string>;
  splatPsnrComputing: boolean;
  splatPsnrComputeRequest: SplatPsnrComputeRequest | null;
  setSplatPsnrFrameReady: (ready: boolean) => void;
  requestSplatPsnrCompute: (scope: SplatPsnrComputeScope, selectedImageId?: ImageId | null) => void;
  setSplatPsnrPending: (imageIds: ImageId[]) => void;
  setSplatPsnrComputingImage: (imageId: ImageId) => void;
  setSplatPsnrMetric: (metric: SplatPsnrMetric) => void;
  setSplatPsnrMetrics: (metrics: SplatPsnrMetric[]) => void;
  setSplatPsnrImageError: (imageId: ImageId, error: string) => void;
  finishSplatPsnrCompute: () => void;
  clearSplatPsnr: () => void;
}

function setManyStatuses(
  current: Map<ImageId, ImageMetricStatus>,
  imageIds: ImageId[],
  status: ImageMetricStatus
): Map<ImageId, ImageMetricStatus> {
  const next = new Map(current);
  for (const imageId of imageIds) {
    next.set(imageId, status);
  }
  return next;
}

export const useImageMetricsStore = create<ImageMetricsState>()((set) => ({
  splatPsnrFrameReady: false,
  splatPsnrMetrics: new Map(),
  splatPsnrStatus: new Map(),
  splatPsnrError: new Map(),
  splatPsnrComputing: false,
  splatPsnrComputeRequest: null,

  setSplatPsnrFrameReady: (splatPsnrFrameReady) => set({ splatPsnrFrameReady }),
  requestSplatPsnrCompute: (scope, selectedImageId = null) => set((state) => ({
    splatPsnrComputeRequest: {
      id: (state.splatPsnrComputeRequest?.id ?? 0) + 1,
      scope,
      selectedImageId: scope === 'selected' ? selectedImageId : null,
    },
  })),
  setSplatPsnrPending: (imageIds) => set((state) => ({
    splatPsnrComputing: imageIds.length > 0,
    splatPsnrStatus: setManyStatuses(state.splatPsnrStatus, imageIds, 'pending'),
  })),
  setSplatPsnrComputingImage: (imageId) => set((state) => ({
    splatPsnrComputing: true,
    splatPsnrStatus: new Map(state.splatPsnrStatus).set(imageId, 'computing'),
  })),
  setSplatPsnrMetric: (metric) => set((state) => {
    const nextMetrics = new Map(state.splatPsnrMetrics);
    nextMetrics.set(metric.imageId, metric);

    const nextStatus = new Map(state.splatPsnrStatus);
    nextStatus.set(metric.imageId, 'ready');

    const nextError = new Map(state.splatPsnrError);
    nextError.delete(metric.imageId);

    return {
      splatPsnrMetrics: nextMetrics,
      splatPsnrStatus: nextStatus,
      splatPsnrError: nextError,
    };
  }),
  setSplatPsnrMetrics: (metrics) => set((state) => {
    if (metrics.length === 0) {
      return {};
    }

    const nextMetrics = new Map(state.splatPsnrMetrics);
    const nextStatus = new Map(state.splatPsnrStatus);
    const nextError = new Map(state.splatPsnrError);

    for (const metric of metrics) {
      nextMetrics.set(metric.imageId, metric);
      nextStatus.set(metric.imageId, 'ready');
      nextError.delete(metric.imageId);
    }

    return {
      splatPsnrMetrics: nextMetrics,
      splatPsnrStatus: nextStatus,
      splatPsnrError: nextError,
    };
  }),
  setSplatPsnrImageError: (imageId, error) => set((state) => ({
    splatPsnrStatus: new Map(state.splatPsnrStatus).set(imageId, 'error'),
    splatPsnrError: new Map(state.splatPsnrError).set(imageId, error),
  })),
  finishSplatPsnrCompute: () => set({ splatPsnrComputing: false }),
  clearSplatPsnr: () => set({
    splatPsnrFrameReady: false,
    splatPsnrMetrics: new Map(),
    splatPsnrStatus: new Map(),
    splatPsnrError: new Map(),
    splatPsnrComputing: false,
    splatPsnrComputeRequest: null,
  }),
}));
