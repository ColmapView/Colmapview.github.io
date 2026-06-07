import {
  selectCameraCount,
  useImageMetricsStore,
  useReconstructionStore,
  type SplatPsnrMetric,
} from '../../store';

export interface FrustumHoverCardStoreFacade {
  multiCamera: boolean;
}

export interface FrustumHoverCardMetricStoreFacade {
  splatMetric?: SplatPsnrMetric;
}

export function useFrustumHoverCardStoreFacade(): FrustumHoverCardStoreFacade {
  const cameraCount = useReconstructionStore(selectCameraCount);

  return {
    multiCamera: cameraCount > 1,
  };
}

export function useFrustumHoverCardMetricStoreFacade(imageId: number): FrustumHoverCardMetricStoreFacade {
  const splatMetric = useImageMetricsStore((state) => state.splatPsnrMetrics.get(imageId));

  return {
    splatMetric,
  };
}
