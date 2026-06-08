import {
  useFloorPlaneStore,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
  type FloorPlaneState,
  type TransformState,
  type UIState,
} from '../../store';
import type { Reconstruction } from '../../types/colmap';
import type { WasmReconstructionWrapper } from '../../wasm/reconstruction';

interface FloorAlignDataFacade {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
}

interface FloorAlignFloorFacade {
  showFloorModal: boolean;
  modalPosition: FloorPlaneState['modalPosition'];
  detectedPlane: FloorPlaneState['detectedPlane'];
  normalFlipped: boolean;
  targetAxis: FloorPlaneState['targetAxis'];
  distanceThreshold: number;
  maxIterations: number;
  sampleCount: number;
  setShowFloorModal: FloorPlaneState['setShowFloorModal'];
  setDetectedPlane: FloorPlaneState['setDetectedPlane'];
  setPointDistances: FloorPlaneState['setPointDistances'];
  setIsDetecting: FloorPlaneState['setIsDetecting'];
  setNormalFlipped: FloorPlaneState['setNormalFlipped'];
  reset: FloorPlaneState['reset'];
}

interface FloorAlignTransformFacade {
  transform: TransformState['transform'];
  setTransform: TransformState['setTransform'];
}

interface FloorAlignUiFacade {
  axesCoordinateSystem: UIState['axesCoordinateSystem'];
}

export interface FloorAlignStoreFacade {
  data: FloorAlignDataFacade;
  floor: FloorAlignFloorFacade;
  transform: FloorAlignTransformFacade;
  ui: FloorAlignUiFacade;
}

export function useFloorAlignStoreFacade(): FloorAlignStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);

  const showFloorModal = useFloorPlaneStore((s) => s.showFloorModal);
  const modalPosition = useFloorPlaneStore((s) => s.modalPosition);
  const detectedPlane = useFloorPlaneStore((s) => s.detectedPlane);
  const normalFlipped = useFloorPlaneStore((s) => s.normalFlipped);
  const targetAxis = useFloorPlaneStore((s) => s.targetAxis);
  const distanceThreshold = useFloorPlaneStore((s) => s.distanceThreshold);
  const maxIterations = useFloorPlaneStore((s) => s.maxIterations);
  const sampleCount = useFloorPlaneStore((s) => s.sampleCount);
  const setShowFloorModal = useFloorPlaneStore((s) => s.setShowFloorModal);
  const setDetectedPlane = useFloorPlaneStore((s) => s.setDetectedPlane);
  const setPointDistances = useFloorPlaneStore((s) => s.setPointDistances);
  const setIsDetecting = useFloorPlaneStore((s) => s.setIsDetecting);
  const setNormalFlipped = useFloorPlaneStore((s) => s.setNormalFlipped);
  const reset = useFloorPlaneStore((s) => s.reset);

  const transform = useTransformStore((s) => s.transform);
  const setTransform = useTransformStore((s) => s.setTransform);

  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);

  return {
    data: { reconstruction, wasmReconstruction },
    floor: {
      showFloorModal,
      modalPosition,
      detectedPlane,
      normalFlipped,
      targetAxis,
      distanceThreshold,
      maxIterations,
      sampleCount,
      setShowFloorModal,
      setDetectedPlane,
      setPointDistances,
      setIsDetecting,
      setNormalFlipped,
      reset,
    },
    transform: { transform, setTransform },
    ui: { axesCoordinateSystem },
  };
}
