import {
  usePointPickingStore,
  useTransformStore,
  useUIStore,
  type PointPickingState,
  type TransformState,
  type UIState,
} from '../../store';

interface DistanceInputPointPickingFacade {
  showDistanceModal: boolean;
  modalPosition: PointPickingState['modalPosition'];
  selectedPoints: PointPickingState['selectedPoints'];
  pickingMode: PointPickingState['pickingMode'];
  normalFlipped: boolean;
  targetAxis: PointPickingState['targetAxis'];
  setShowDistanceModal: PointPickingState['setShowDistanceModal'];
  setTargetDistance: PointPickingState['setTargetDistance'];
  clearSelectedPoints: PointPickingState['clearSelectedPoints'];
  reset: PointPickingState['reset'];
}

interface DistanceInputTransformFacade {
  transform: TransformState['transform'];
  setTransform: TransformState['setTransform'];
}

interface DistanceInputUiFacade {
  axesCoordinateSystem: UIState['axesCoordinateSystem'];
}

export interface DistanceInputStoreFacade {
  pointPicking: DistanceInputPointPickingFacade;
  transform: DistanceInputTransformFacade;
  ui: DistanceInputUiFacade;
}

export function useDistanceInputStoreFacade(): DistanceInputStoreFacade {
  const showDistanceModal = usePointPickingStore((s) => s.showDistanceModal);
  const modalPosition = usePointPickingStore((s) => s.modalPosition);
  const selectedPoints = usePointPickingStore((s) => s.selectedPoints);
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const normalFlipped = usePointPickingStore((s) => s.normalFlipped);
  const targetAxis = usePointPickingStore((s) => s.targetAxis);
  const setShowDistanceModal = usePointPickingStore((s) => s.setShowDistanceModal);
  const setTargetDistance = usePointPickingStore((s) => s.setTargetDistance);
  const clearSelectedPoints = usePointPickingStore((s) => s.clearSelectedPoints);
  const reset = usePointPickingStore((s) => s.reset);

  const transform = useTransformStore((s) => s.transform);
  const setTransform = useTransformStore((s) => s.setTransform);

  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);

  return {
    pointPicking: {
      showDistanceModal,
      modalPosition,
      selectedPoints,
      pickingMode,
      normalFlipped,
      targetAxis,
      setShowDistanceModal,
      setTargetDistance,
      clearSelectedPoints,
      reset,
    },
    transform: {
      transform,
      setTransform,
    },
    ui: {
      axesCoordinateSystem,
    },
  };
}
