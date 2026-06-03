import {
  usePointPickingStore,
  useUIStore,
  type PointPickingState,
  type UIState,
} from '../../store';

interface SceneContextMenuDataFacade {
  touchMode: UIState['touchMode'];
  pickingMode: PointPickingState['pickingMode'];
  selectedPointsLength: number;
  markerRightClickHandled: PointPickingState['markerRightClickHandled'];
}

interface SceneContextMenuActionsFacade {
  openContextMenu: UIState['openContextMenu'];
  closeContextMenu: UIState['closeContextMenu'];
  removeLastPoint: PointPickingState['removeLastPoint'];
  resetPointPicking: PointPickingState['reset'];
  setMarkerRightClickHandled: PointPickingState['setMarkerRightClickHandled'];
}

export interface SceneContextMenuStoreFacade {
  data: SceneContextMenuDataFacade;
  actions: SceneContextMenuActionsFacade;
}

export function useSceneContextMenuStoreFacade(): SceneContextMenuStoreFacade {
  const openContextMenu = useUIStore((state) => state.openContextMenu);
  const closeContextMenu = useUIStore((state) => state.closeContextMenu);
  const touchMode = useUIStore((state) => state.touchMode);

  const pickingMode = usePointPickingStore((state) => state.pickingMode);
  const selectedPointsLength = usePointPickingStore((state) => state.selectedPoints.length);
  const removeLastPoint = usePointPickingStore((state) => state.removeLastPoint);
  const resetPointPicking = usePointPickingStore((state) => state.reset);
  const markerRightClickHandled = usePointPickingStore((state) => state.markerRightClickHandled);
  const setMarkerRightClickHandled = usePointPickingStore((state) => state.setMarkerRightClickHandled);

  return {
    data: {
      touchMode,
      pickingMode,
      selectedPointsLength,
      markerRightClickHandled,
    },
    actions: {
      openContextMenu,
      closeContextMenu,
      removeLastPoint,
      resetPointPicking,
      setMarkerRightClickHandled,
    },
  };
}
