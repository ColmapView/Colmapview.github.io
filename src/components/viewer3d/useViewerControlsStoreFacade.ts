import {
  useAxesNode,
  useAxesNodeActions,
  useCamerasNode,
  useCamerasNodeActions,
  useGridNode,
  useGridNodeActions,
  useMatchesNode,
  useMatchesNodeActions,
  useNavigationNode,
  useNavigationNodeActions,
  usePointsNode,
  usePointsNodeActions,
  useRigNode,
  useRigNodeActions,
  useSelectionNode,
  useSelectionNodeActions,
  type AxesNode,
  type AxesNodeActions,
  type CamerasNode,
  type CamerasNodeActions,
  type GridNode,
  type GridNodeActions,
  type MatchesNode,
  type MatchesNodeActions,
  type NavigationNode,
  type NavigationNodeActions,
  type PointsNode,
  type PointsNodeActions,
  type RigNode,
  type RigNodeActions,
  type SelectionNode,
  type SelectionNodeActions,
} from '../../nodes';
import { useReconstructionStore, useUIStore, type UIState } from '../../store';
import type { Reconstruction } from '../../types/colmap';

interface ViewerControlsUiFacade {
  touchMode: boolean;
  backgroundColor: string;
  setBackgroundColor: UIState['setBackgroundColor'];
  setView: UIState['setView'];
  autoHideButtons: boolean;
}

interface ViewerControlsNodeFacade {
  points: PointsNode;
  cameras: CamerasNode;
  selection: SelectionNode;
  navigation: NavigationNode;
  matches: MatchesNode;
  axes: AxesNode;
  grid: GridNode;
  rig: RigNode;
}

interface ViewerControlsActionFacade {
  points: PointsNodeActions;
  cameras: CamerasNodeActions;
  selection: SelectionNodeActions;
  navigation: NavigationNodeActions;
  matches: MatchesNodeActions;
  axes: AxesNodeActions;
  grid: GridNodeActions;
  rig: RigNodeActions;
}

export interface ViewerControlsStoreFacade {
  ui: ViewerControlsUiFacade;
  nodes: ViewerControlsNodeFacade;
  actions: ViewerControlsActionFacade;
  reconstruction: Reconstruction | null;
}

export function useViewerControlsStoreFacade(): ViewerControlsStoreFacade {
  const touchMode = useUIStore((s) => s.touchMode);
  const backgroundColor = useUIStore((s) => s.backgroundColor);
  const setBackgroundColor = useUIStore((s) => s.setBackgroundColor);
  const setView = useUIStore((s) => s.setView);
  const autoHideButtons = useUIStore((s) => s.autoHideElements.buttons);

  return {
    ui: {
      touchMode,
      backgroundColor,
      setBackgroundColor,
      setView,
      autoHideButtons,
    },
    nodes: {
      points: usePointsNode(),
      cameras: useCamerasNode(),
      selection: useSelectionNode(),
      navigation: useNavigationNode(),
      matches: useMatchesNode(),
      axes: useAxesNode(),
      grid: useGridNode(),
      rig: useRigNode(),
    },
    actions: {
      points: usePointsNodeActions(),
      cameras: useCamerasNodeActions(),
      selection: useSelectionNodeActions(),
      navigation: useNavigationNodeActions(),
      matches: useMatchesNodeActions(),
      axes: useAxesNodeActions(),
      grid: useGridNodeActions(),
      rig: useRigNodeActions(),
    },
    reconstruction: useReconstructionStore((s) => s.reconstruction),
  };
}
