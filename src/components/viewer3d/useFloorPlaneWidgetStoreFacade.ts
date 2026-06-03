import {
  useFloorPlaneStore,
  useUIStore,
  type FloorPlaneState,
  type UIState,
} from '../../store';

interface FloorPlaneWidgetFloorFacade {
  detectedPlane: FloorPlaneState['detectedPlane'];
  normalFlipped: boolean;
  targetAxis: FloorPlaneState['targetAxis'];
  showFloorModal: boolean;
  toggleNormalFlipped: FloorPlaneState['toggleNormalFlipped'];
  cycleTargetAxis: FloorPlaneState['cycleTargetAxis'];
  setShowFloorModal: FloorPlaneState['setShowFloorModal'];
  setModalPosition: FloorPlaneState['setModalPosition'];
}

interface FloorPlaneWidgetUiFacade {
  axesScale: number;
  axesCoordinateSystem: UIState['axesCoordinateSystem'];
}

export interface FloorPlaneWidgetStoreFacade {
  floor: FloorPlaneWidgetFloorFacade;
  ui: FloorPlaneWidgetUiFacade;
}

export function useFloorPlaneWidgetStoreFacade(): FloorPlaneWidgetStoreFacade {
  const detectedPlane = useFloorPlaneStore((s) => s.detectedPlane);
  const normalFlipped = useFloorPlaneStore((s) => s.normalFlipped);
  const targetAxis = useFloorPlaneStore((s) => s.targetAxis);
  const showFloorModal = useFloorPlaneStore((s) => s.showFloorModal);
  const toggleNormalFlipped = useFloorPlaneStore((s) => s.toggleNormalFlipped);
  const cycleTargetAxis = useFloorPlaneStore((s) => s.cycleTargetAxis);
  const setShowFloorModal = useFloorPlaneStore((s) => s.setShowFloorModal);
  const setModalPosition = useFloorPlaneStore((s) => s.setModalPosition);

  const axesScale = useUIStore((s) => s.axesScale);
  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);

  return {
    floor: {
      detectedPlane,
      normalFlipped,
      targetAxis,
      showFloorModal,
      toggleNormalFlipped,
      cycleTargetAxis,
      setShowFloorModal,
      setModalPosition,
    },
    ui: {
      axesScale,
      axesCoordinateSystem,
    },
  };
}
