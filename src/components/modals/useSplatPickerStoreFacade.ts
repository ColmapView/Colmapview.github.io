import { useReconstructionStore, useSplatBackendStore } from '../../store';
import type { SplatFileSource } from '../../types/colmap';
import type {
  SplatBackendPreference,
  WebGpuSplatBackendState,
} from '../../utils/splatBackendPolicy';

export interface SplatPickerStoreFacade {
  showSplatPicker: boolean;
  splatFileSources: readonly SplatFileSource[];
  /** Backend inputs for the byte-less loader gate (see canUseByteLessSplatLoader). */
  requestedSplatBackend: SplatBackendPreference;
  webGpuSplatAvailability: WebGpuSplatBackendState;
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
  const requestedSplatBackend = useSplatBackendStore((state) => state.requestedBackend);
  const webGpuSplatAvailability = useSplatBackendStore((state) => state.availability.webGpu);

  const selectSplatSource = (sourceId: string) => {
    void selectSplatSourceAction(sourceId);
  };

  return {
    showSplatPicker,
    splatFileSources,
    requestedSplatBackend,
    webGpuSplatAvailability,
    setShowSplatPicker,
    selectSplatSource,
  };
}
