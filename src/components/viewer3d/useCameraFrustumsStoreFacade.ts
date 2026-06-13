import { useCallback } from 'react';
import { useDataset, type DatasetManager } from '../../dataset';
import {
  useCamerasNode,
  useMatchesNode,
  useNavigationNode,
  useSelectionNode,
  useNavigationNodeActions,
  useSelectionNodeActions,
  type CamerasNode,
  type MatchesNode,
  type NavigationNode,
  type NavigationNodeActions,
  type SelectionNode,
  type SelectionNodeActions,
} from '../../nodes';
import {
  useDeletionStore,
  useImageMetricsStore,
  useReconstructionStore,
  useSplatBackendStore,
  useUIStore,
  type DeletionState,
  type ImageMetricsState,
  type UIState,
} from '../../store';
import { useIsAlignmentMode } from '../../hooks/useAlignmentMode';
import { shouldExposeSplatMetricVisualizations } from '../../utils/splatBackendPolicy';
import type { Reconstruction } from '../../types/colmap';
import type { FrustumPsnrMetricSource } from './cameraFrustumViewModel';

const EMPTY_SPLAT_PSNR_BY_IMAGE: FrustumPsnrMetricSource = new Map();

interface CameraFrustumsDataFacade {
  reconstruction: Reconstruction | null;
  dataset: DatasetManager;
  cameras: CamerasNode;
  selection: SelectionNode;
  matches: MatchesNode;
  nav: NavigationNode;
  isAlignmentMode: boolean;
  touchMode: UIState['touchMode'];
  pendingDeletions: DeletionState['pendingDeletions'];
  splatPsnrByImage: FrustumPsnrMetricSource;
}

interface CameraFrustumsActionsFacade {
  navActions: NavigationNodeActions;
  selectionActions: SelectionNodeActions;
  openImageDetail: UIState['openImageDetail'];
  setMatchedImageId: UIState['setMatchedImageId'];
  setShowMatchesInModal: UIState['setShowMatchesInModal'];
}

export interface CameraFrustumsStoreFacade {
  data: CameraFrustumsDataFacade;
  actions: CameraFrustumsActionsFacade;
}

export function useCameraFrustumsStoreFacade(): CameraFrustumsStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const activeSplatFile = useReconstructionStore((s) => s.loadedFiles?.splatFile);
  const dataset = useDataset();
  const cameras = useCamerasNode();
  const splatBackendResolution = useSplatBackendStore((s) => s.resolution);
  const splatMetricAvailability = useSplatBackendStore((s) => s.metricAvailability);
  const splatMetricCapability = useSplatBackendStore((s) => s.metricCapability);
  const splatMetricVisualizationsAvailable = shouldExposeSplatMetricVisualizations({
    activeSplatFile,
    resolution: splatBackendResolution,
    metricAvailability: splatMetricAvailability,
    metricCapability: splatMetricCapability,
  });
  const splatPsnrByImage = useImageMetricsStore(useCallback(
    (state: ImageMetricsState) => splatMetricVisualizationsAvailable
      && (cameras.colorMode === 'splatPsnr' || cameras.colorMode === 'splatSsim')
      ? state.splatPsnrMetrics
      : EMPTY_SPLAT_PSNR_BY_IMAGE,
    [cameras.colorMode, splatMetricVisualizationsAvailable]
  ));
  const selection = useSelectionNode();
  const matches = useMatchesNode();
  const nav = useNavigationNode();
  const navActions = useNavigationNodeActions();
  const selectionActions = useSelectionNodeActions();
  const isAlignmentMode = useIsAlignmentMode();
  const openImageDetail = useUIStore((s) => s.openImageDetail);
  const setMatchedImageId = useUIStore((s) => s.setMatchedImageId);
  const setShowMatchesInModal = useUIStore((s) => s.setShowMatchesInModal);
  const touchMode = useUIStore((s) => s.touchMode);
  const pendingDeletions = useDeletionStore((s) => s.pendingDeletions);

  return {
    data: {
      reconstruction,
      dataset,
      cameras,
      selection,
      matches,
      nav,
      isAlignmentMode,
      touchMode,
      pendingDeletions,
      splatPsnrByImage,
    },
    actions: {
      navActions,
      selectionActions,
      openImageDetail,
      setMatchedImageId,
      setShowMatchesInModal,
    },
  };
}
