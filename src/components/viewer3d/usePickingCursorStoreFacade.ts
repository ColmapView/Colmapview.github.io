import { usePointPickingStore, type PointPickingMode } from '../../store';

export interface PickingCursorStoreFacade {
  pickingMode: PointPickingMode;
  selectedPointsLength: number;
}

export function usePickingCursorStoreFacade(): PickingCursorStoreFacade {
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const selectedPointsLength = usePointPickingStore((s) => s.selectedPoints.length);

  return {
    pickingMode,
    selectedPointsLength,
  };
}
