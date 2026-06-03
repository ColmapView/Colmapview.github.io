import {
  usePointsNode,
  useSelectionNode,
  type PointsNode,
  type SelectionNode,
} from '../../../nodes';
import {
  useDeletionStore,
  useFloorPlaneStore,
  usePointPickingStore,
  useReconstructionStore,
  type DeletionState,
  type FloorPlaneState,
  type PointPickingState,
} from '../../../store';
import type { Reconstruction } from '../../../types/colmap';
import type { WasmReconstructionWrapper } from '../../../wasm/reconstruction';
import { useSplatLayerRuntimeStore } from './splatLayerRuntimeStore';

interface PointCloudDataFacade {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
  points: PointsNode;
  selection: SelectionNode;
  pointPicking: {
    pickingMode: PointPickingState['pickingMode'];
    selectedPointsLength: number;
  };
  floor: {
    pointDistances: FloorPlaneState['pointDistances'];
    distanceThreshold: FloorPlaneState['distanceThreshold'];
    floorColorMode: FloorPlaneState['floorColorMode'];
  };
  splatFile?: File;
  readySplatFile: File | null;
  deletion: {
    pendingDeletions: DeletionState['pendingDeletions'];
  };
}

interface PointCloudActionsFacade {
  addSelectedPoint: PointPickingState['addSelectedPoint'];
  setHoveredPoint: PointPickingState['setHoveredPoint'];
}

export interface PointCloudStoreFacade {
  data: PointCloudDataFacade;
  actions: PointCloudActionsFacade;
}

export function usePointCloudStoreFacade(): PointCloudStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  const splatFile = useReconstructionStore((s) => s.loadedFiles?.splatFile);
  const readySplatFile = useSplatLayerRuntimeStore((s) => s.readySplatFile);
  const points = usePointsNode();
  const selection = useSelectionNode();
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const selectedPointsLength = usePointPickingStore((s) => s.selectedPoints.length);
  const addSelectedPoint = usePointPickingStore((s) => s.addSelectedPoint);
  const setHoveredPoint = usePointPickingStore((s) => s.setHoveredPoint);
  const pointDistances = useFloorPlaneStore((s) => s.pointDistances);
  const distanceThreshold = useFloorPlaneStore((s) => s.distanceThreshold);
  const floorColorMode = useFloorPlaneStore((s) => s.floorColorMode);
  const pendingDeletions = useDeletionStore((s) => s.pendingDeletions);

  return {
    data: {
      reconstruction,
      wasmReconstruction,
      points,
      selection,
      pointPicking: {
        pickingMode,
        selectedPointsLength,
      },
      floor: {
        pointDistances,
        distanceThreshold,
        floorColorMode,
      },
      splatFile,
      readySplatFile,
      deletion: {
        pendingDeletions,
      },
    },
    actions: {
      addSelectedPoint,
      setHoveredPoint,
    },
  };
}
