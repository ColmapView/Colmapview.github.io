import { create } from 'zustand';
import type { ImageId } from '../../types/colmap';

export type ImageMetricStatus = 'idle' | 'pending' | 'computing' | 'ready' | 'error';
export type SplatPsnrComputeScope = 'selected' | 'all';

export interface SplatPsnrMetric {
  imageId: ImageId;
  psnr: number;
  ssim?: number;
  mse: number;
  validPixelCount: number;
  width: number;
  height: number;
  computedAt: number;
  renderBackground?: SplatPsnrRenderBackground;
}

export type SplatPsnrRenderBackgroundLabel = 'opaque-black';

export interface SplatPsnrRenderBackground {
  label: SplatPsnrRenderBackgroundLabel;
  rgba: [number, number, number, number];
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

function deleteImageIds<T>(current: Map<ImageId, T>, imageIds: ImageId[]): Map<ImageId, T> {
  const next = new Map(current);
  for (const imageId of imageIds) {
    next.delete(imageId);
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
    splatPsnrMetrics: deleteImageIds(state.splatPsnrMetrics, imageIds),
    splatPsnrError: deleteImageIds(state.splatPsnrError, imageIds),
  })),
  setSplatPsnrComputingImage: (imageId) => set((state) => {
    const nextMetrics = new Map(state.splatPsnrMetrics);
    nextMetrics.delete(imageId);

    const nextError = new Map(state.splatPsnrError);
    nextError.delete(imageId);

    return {
      splatPsnrComputing: true,
      splatPsnrStatus: new Map(state.splatPsnrStatus).set(imageId, 'computing'),
      splatPsnrMetrics: nextMetrics,
      splatPsnrError: nextError,
    };
  }),
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
  setSplatPsnrImageError: (imageId, error) => set((state) => {
    const nextMetrics = new Map(state.splatPsnrMetrics);
    nextMetrics.delete(imageId);

    return {
      splatPsnrStatus: new Map(state.splatPsnrStatus).set(imageId, 'error'),
      splatPsnrMetrics: nextMetrics,
      splatPsnrError: new Map(state.splatPsnrError).set(imageId, error),
    };
  }),
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
