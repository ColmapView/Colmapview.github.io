import {
  usePointCloudStore,
  usePointPickingStore,
  useUIStore,
  type PointCloudState,
  type PointPickingState,
  type UIState,
} from '../../store';
import { needsMoreSelectedPoints } from '../../store/pointPickingPolicy';
import { getDefaultUpAxis } from '../../store/stores/pointPickingStore';

interface SelectedPointMarkersDataFacade {
  selectedPoints: PointPickingState['selectedPoints'];
  pickingMode: PointPickingState['pickingMode'];
  normalFlipped: PointPickingState['normalFlipped'];
  targetAxis: PointPickingState['targetAxis'];
  hoveredPoint: PointPickingState['hoveredPoint'];
  pointSize: PointCloudState['pointSize'];
  axesCoordinateSystem: UIState['axesCoordinateSystem'];
  defaultTargetAxis: PointPickingState['targetAxis'];
}

interface SelectedPointMarkersActionsFacade {
  removePointAt: PointPickingState['removePointAt'];
  toggleNormalFlipped: PointPickingState['toggleNormalFlipped'];
  cycleTargetAxis: PointPickingState['cycleTargetAxis'];
  setTargetAxis: PointPickingState['setTargetAxis'];
}

export interface SelectedPointMarkersStoreFacade {
  data: SelectedPointMarkersDataFacade;
  actions: SelectedPointMarkersActionsFacade;
}

export function useSelectedPointMarkersStoreFacade(): SelectedPointMarkersStoreFacade {
  const selectedPoints = usePointPickingStore((s) => s.selectedPoints);
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const removePointAt = usePointPickingStore((s) => s.removePointAt);
  const normalFlipped = usePointPickingStore((s) => s.normalFlipped);
  const toggleNormalFlipped = usePointPickingStore((s) => s.toggleNormalFlipped);
  const targetAxis = usePointPickingStore((s) => s.targetAxis);
  const cycleTargetAxis = usePointPickingStore((s) => s.cycleTargetAxis);
  const setTargetAxis = usePointPickingStore((s) => s.setTargetAxis);
  const pointSize = usePointCloudStore((s) => s.pointSize);
  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);
  const needsMorePoints = needsMoreSelectedPoints(selectedPoints.length, pickingMode);
  const hoveredPoint = usePointPickingStore((s) => needsMorePoints ? s.hoveredPoint : null);

  return {
    data: {
      selectedPoints,
      pickingMode,
      normalFlipped,
      targetAxis,
      hoveredPoint,
      pointSize,
      axesCoordinateSystem,
      defaultTargetAxis: getDefaultUpAxis(axesCoordinateSystem),
    },
    actions: {
      removePointAt,
      toggleNormalFlipped,
      cycleTargetAxis,
      setTargetAxis,
    },
  };
}
