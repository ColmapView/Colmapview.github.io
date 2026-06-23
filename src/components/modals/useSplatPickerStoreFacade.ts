import { useReconstructionStore } from '../../store';
import type { SplatFileSource } from '../../types/colmap';

export interface SplatPickerStoreFacade {
  showSplatPicker: boolean;
  splatFileSources: readonly SplatFileSource[];
  setShowSplatPicker: (show: boolean) => void;
  selectSplatSource: (sourceId: string) => void;
}

const EMPTY_SPLAT_SOURCES: readonly SplatFileSource[] = [];

export function useSplatPickerStoreFacade(): SplatPickerStoreFacade {
  const showSplatPicker = useReconstructionStore((state) => state.showSplatPicker);
  const splatFileSources = useReconstructionStore(
    (state) => state.loadedFiles?.splatFileSources ?? EMPTY_SPLAT_SOURCES
  );
  const setShowSplatPicker = useReconstructionStore((state) => state.setShowSplatPicker);
  const selectSplatSourceAction = useReconstructionStore((state) => state.selectSplatSource);

  const selectSplatSource = (sourceId: string) => {
    void selectSplatSourceAction(sourceId);
  };

  return { showSplatPicker, splatFileSources, setShowSplatPicker, selectSplatSource };
}
