import { useReconstructionStore, useUIStore } from '../../store';
import type { SplatFileSource } from '../../types/colmap';

export interface SplatPickerStoreFacade {
  showSplatPicker: boolean;
  splatFileSources: readonly SplatFileSource[];
  touchMode: boolean;
  setShowSplatPicker: (show: boolean) => void;
  selectSplatSource: (sourceId: string) => void;
}

const EMPTY_SPLAT_SOURCES: readonly SplatFileSource[] = [];

export function useSplatPickerStoreFacade(): SplatPickerStoreFacade {
  const showSplatPicker = useReconstructionStore((state) => state.showSplatPicker);
  const splatFileSources = useReconstructionStore(
    (state) => state.loadedFiles?.splatFileSources ?? EMPTY_SPLAT_SOURCES
  );
  const touchMode = useUIStore((state) => state.touchMode);
  const setShowSplatPicker = useReconstructionStore((state) => state.setShowSplatPicker);
  const selectSplatSourceAction = useReconstructionStore((state) => state.selectSplatSource);

  const selectSplatSource = (sourceId: string) => {
    void selectSplatSourceAction(sourceId);
  };

  return { showSplatPicker, splatFileSources, touchMode, setShowSplatPicker, selectSplatSource };
}
