import {
  usePointPickingStore,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
  type PointPickingState,
  type TransformState,
  type UIState,
} from '../../store';
import type { Reconstruction } from '../../types/colmap';

interface TrackballControlsDataFacade {
  reconstruction: Reconstruction | null;
  pickingMode: PointPickingState['pickingMode'];
  transform: TransformState['transform'];
  touchMode: UIState['touchMode'];
}

export interface TrackballControlsStoreFacade {
  data: TrackballControlsDataFacade;
}

export function useTrackballControlsStoreFacade(): TrackballControlsStoreFacade {
  const reconstruction = useReconstructionStore((state) => state.reconstruction);
  const pickingMode = usePointPickingStore((state) => state.pickingMode);
  const transform = useTransformStore((state) => state.transform);
  const touchMode = useUIStore((state) => state.touchMode);

  return {
    data: {
      reconstruction,
      pickingMode,
      transform,
      touchMode,
    },
  };
}
