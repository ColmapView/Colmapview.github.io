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

interface FloorDetectionDataFacade {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
}

interface FloorDetectionFloorFacade {
  detectedPlane: FloorPlaneState['detectedPlane'];
  distanceThreshold: number;
  sampleCount: number;
  floorColorMode: FloorPlaneState['floorColorMode'];
  isDetecting: boolean;
  normalFlipped: boolean;
  targetAxis: FloorPlaneState['targetAxis'];
  setDetectedPlane: FloorPlaneState['setDetectedPlane'];
  setDistanceThreshold: FloorPlaneState['setDistanceThreshold'];
  setSampleCount: FloorPlaneState['setSampleCount'];
  setFloorColorMode: FloorPlaneState['setFloorColorMode'];
  setPointDistances: FloorPlaneState['setPointDistances'];
  setIsDetecting: FloorPlaneState['setIsDetecting'];
  toggleNormalFlipped: FloorPlaneState['toggleNormalFlipped'];
  cycleTargetAxis: FloorPlaneState['cycleTargetAxis'];
  reset: FloorPlaneState['reset'];
}

interface FloorDetectionTransformFacade {
  transform: TransformState['transform'];
  setTransform: TransformState['setTransform'];
}

interface FloorDetectionUiFacade {
  axesCoordinateSystem: UIState['axesCoordinateSystem'];
}

export interface FloorDetectionStoreFacade {
  data: FloorDetectionDataFacade;
  floor: FloorDetectionFloorFacade;
  transform: FloorDetectionTransformFacade;
  ui: FloorDetectionUiFacade;
}

export function useFloorDetectionStoreFacade(): FloorDetectionStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);

  const detectedPlane = useFloorPlaneStore((s) => s.detectedPlane);
  const distanceThreshold = useFloorPlaneStore((s) => s.distanceThreshold);
  const sampleCount = useFloorPlaneStore((s) => s.sampleCount);
  const floorColorMode = useFloorPlaneStore((s) => s.floorColorMode);
  const isDetecting = useFloorPlaneStore((s) => s.isDetecting);
  const normalFlipped = useFloorPlaneStore((s) => s.normalFlipped);
  const targetAxis = useFloorPlaneStore((s) => s.targetAxis);
  const setDetectedPlane = useFloorPlaneStore((s) => s.setDetectedPlane);
  const setDistanceThreshold = useFloorPlaneStore((s) => s.setDistanceThreshold);
  const setSampleCount = useFloorPlaneStore((s) => s.setSampleCount);
  const setFloorColorMode = useFloorPlaneStore((s) => s.setFloorColorMode);
  const setPointDistances = useFloorPlaneStore((s) => s.setPointDistances);
  const setIsDetecting = useFloorPlaneStore((s) => s.setIsDetecting);
  const toggleNormalFlipped = useFloorPlaneStore((s) => s.toggleNormalFlipped);
  const cycleTargetAxis = useFloorPlaneStore((s) => s.cycleTargetAxis);
  const reset = useFloorPlaneStore((s) => s.reset);

  const transform = useTransformStore((s) => s.transform);
  const setTransform = useTransformStore((s) => s.setTransform);

  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);

  return {
    data: { reconstruction, wasmReconstruction },
    floor: {
      detectedPlane,
      distanceThreshold,
      sampleCount,
      floorColorMode,
      isDetecting,
      normalFlipped,
      targetAxis,
      setDetectedPlane,
      setDistanceThreshold,
      setSampleCount,
      setFloorColorMode,
      setPointDistances,
      setIsDetecting,
      toggleNormalFlipped,
      cycleTargetAxis,
      reset,
    },
    transform: { transform, setTransform },
    ui: { axesCoordinateSystem },
  };
}
