import { useShallow } from 'zustand/react/shallow';
import { useTrainingStore, useReconstructionStore, useSplatBackendStore } from '../store';

/** Renderer-specific backend state stays behind the same boundary as preview visibility. */
export function useTrainingSparkBackendFacade() {
  return useSplatBackendStore(useShallow((state) => ({
    requestedBackend: state.requestedBackend,
    availability: state.availability,
    setSparkBackendAvailable: state.setSparkBackendAvailable,
    setSparkPreloadFailed: state.setSparkPreloadFailed,
  })));
}

/** Imperative renderer callbacks report errors without owning session state. */
export function setTrainingPreviewError(previewError: string): void {
  useTrainingStore.setState({ previewError });
}

/** Catalog selection takes precedence over the retained final preview renderer. */
export function useTrainingPreviewVisible(): boolean {
  const active = useTrainingStore((state) => state.previewActive && state.previewEnabled);
  const finalJobId = useTrainingStore((state) => state.finalLoadedJobId);
  const selectedFinalJobId = useReconstructionStore((state) => state.loadedFiles?.splatFileSources
    ?.find((source) => source.file === state.loadedFiles?.splatFile)?.trainingResult?.jobId);
  return active && (!finalJobId || finalJobId === selectedFinalJobId);
}
