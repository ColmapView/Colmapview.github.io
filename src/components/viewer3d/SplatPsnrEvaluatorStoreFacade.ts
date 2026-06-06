import { useDataset, type DatasetManager } from '../../dataset';
import {
  useImageMetricsStore,
  useReconstructionStore,
  useSplatBackendStore,
  useTransformStore,
  type ImageMetricsState,
} from '../../store';
import type {
  SplatBackendResolution,
  SplatMetricCapability,
} from '../../utils/splatBackendPolicy';
import type { Reconstruction } from '../../types/colmap';
import type { Sim3dEuler } from '../../types/sim3d';

type ReconstructionStoreSnapshot = ReturnType<typeof useReconstructionStore.getState>;

export interface SplatPsnrDatasetIdentity {
  sourceType: ReconstructionStoreSnapshot['sourceType'];
  imageUrlBase: ReconstructionStoreSnapshot['imageUrlBase'];
  maskUrlBase: ReconstructionStoreSnapshot['maskUrlBase'];
  loadedFiles: ReconstructionStoreSnapshot['loadedFiles'];
}

interface SplatPsnrEvaluatorDataFacade {
  reconstruction: Reconstruction | null;
  dataset: DatasetManager;
  datasetIdentity: SplatPsnrDatasetIdentity;
  splatFile?: File;
  splatPsnrFrameReady: boolean;
  splatPsnrComputeRequest: ImageMetricsState['splatPsnrComputeRequest'];
  splatBackendResolution: SplatBackendResolution;
  splatMetricCapability: SplatMetricCapability;
  transform: Sim3dEuler;
}

interface SplatPsnrEvaluatorActionsFacade {
  setWebGpuMetricState: ReturnType<typeof useSplatBackendStore.getState>['setWebGpuMetricState'];
  setSplatPsnrFrameReady: ImageMetricsState['setSplatPsnrFrameReady'];
  setSplatPsnrPending: ImageMetricsState['setSplatPsnrPending'];
  setSplatPsnrComputingImage: ImageMetricsState['setSplatPsnrComputingImage'];
  setSplatPsnrMetric: ImageMetricsState['setSplatPsnrMetric'];
  setSplatPsnrMetrics: ImageMetricsState['setSplatPsnrMetrics'];
  setSplatPsnrImageError: ImageMetricsState['setSplatPsnrImageError'];
  requestSplatPsnrCompute: ImageMetricsState['requestSplatPsnrCompute'];
  finishSplatPsnrCompute: ImageMetricsState['finishSplatPsnrCompute'];
}

export interface SplatPsnrEvaluatorStoreFacade {
  data: SplatPsnrEvaluatorDataFacade;
  actions: SplatPsnrEvaluatorActionsFacade;
}

export function useSplatPsnrEvaluatorStoreFacade(): SplatPsnrEvaluatorStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const sourceType = useReconstructionStore((s) => s.sourceType);
  const imageUrlBase = useReconstructionStore((s) => s.imageUrlBase);
  const maskUrlBase = useReconstructionStore((s) => s.maskUrlBase);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const splatFile = useReconstructionStore((s) => s.loadedFiles?.splatFile);
  const dataset = useDataset();
  const transform = useTransformStore((s) => s.transform);
  const splatBackendResolution = useSplatBackendStore((s) => s.resolution);
  const splatMetricCapability = useSplatBackendStore((s) => s.metricCapability);
  const setWebGpuMetricState = useSplatBackendStore((s) => s.setWebGpuMetricState);
  const splatPsnrFrameReady = useImageMetricsStore((s) => s.splatPsnrFrameReady);
  const splatPsnrComputeRequest = useImageMetricsStore((s) => s.splatPsnrComputeRequest);
  const setSplatPsnrFrameReady = useImageMetricsStore((s) => s.setSplatPsnrFrameReady);
  const setSplatPsnrPending = useImageMetricsStore((s) => s.setSplatPsnrPending);
  const setSplatPsnrComputingImage = useImageMetricsStore((s) => s.setSplatPsnrComputingImage);
  const setSplatPsnrMetric = useImageMetricsStore((s) => s.setSplatPsnrMetric);
  const setSplatPsnrMetrics = useImageMetricsStore((s) => s.setSplatPsnrMetrics);
  const setSplatPsnrImageError = useImageMetricsStore((s) => s.setSplatPsnrImageError);
  const requestSplatPsnrCompute = useImageMetricsStore((s) => s.requestSplatPsnrCompute);
  const finishSplatPsnrCompute = useImageMetricsStore((s) => s.finishSplatPsnrCompute);

  return {
    data: {
      reconstruction,
      dataset,
      datasetIdentity: {
        sourceType,
        imageUrlBase,
        maskUrlBase,
        loadedFiles,
      },
      splatFile,
      splatPsnrFrameReady,
      splatPsnrComputeRequest,
      splatBackendResolution,
      splatMetricCapability,
      transform,
    },
    actions: {
      setWebGpuMetricState,
      setSplatPsnrFrameReady,
      setSplatPsnrPending,
      setSplatPsnrComputingImage,
      setSplatPsnrMetric,
      setSplatPsnrMetrics,
      setSplatPsnrImageError,
      requestSplatPsnrCompute,
      finishSplatPsnrCompute,
    },
  };
}
