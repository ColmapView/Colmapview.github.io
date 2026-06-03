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
  useReconstructionStore,
  useUIStore,
  type DeletionState,
  type UIState,
} from '../../store';
import { useIsAlignmentMode } from '../../hooks/useAlignmentMode';
import type { Reconstruction } from '../../types/colmap';

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
  const dataset = useDataset();
  const cameras = useCamerasNode();
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
