import { useReconstructionStore } from '../../store/reconstructionStore';
import { useImageMetricsStore } from '../../store/stores/imageMetricsStore';
import { useUIStore } from '../../store/stores/uiStore';
import { useTrainingStore } from '../../store/stores/trainingStore';
import { formatTrainingStatus } from '../training/trainingUiPolicy';

export interface StatusBarStoreFacade {
  urlLoading: ReturnType<typeof useReconstructionStore.getState>['urlLoading'];
  reconstruction: ReturnType<typeof useReconstructionStore.getState>['reconstruction'];
  wasmReconstruction: ReturnType<typeof useReconstructionStore.getState>['wasmReconstruction'];
  hasSplatFile: boolean;
  splatPsnrFrameReady: ReturnType<typeof useImageMetricsStore.getState>['splatPsnrFrameReady'];
  splatPsnrByImage: ReturnType<typeof useImageMetricsStore.getState>['splatPsnrMetrics'];
  fps: ReturnType<typeof useUIStore.getState>['fps'];
  autoHideButtons: ReturnType<typeof useUIStore.getState>['autoHideElements']['buttons'];
  isIdle: ReturnType<typeof useUIStore.getState>['isIdle'];
  showAutoHideEditor: ReturnType<typeof useUIStore.getState>['showAutoHideEditor'];
  /** Opens the shared keyboard-shortcuts / About panel (HotkeyHelpModal). */
  setShowHotkeyHelp: ReturnType<typeof useUIStore.getState>['setShowHotkeyHelp'];
  trainingStatus: string | null;
  setTrainingDockOpen: ReturnType<typeof useTrainingStore.getState>['setDockOpen'];
}

export function useStatusBarStoreFacade(): StatusBarStoreFacade {
  const urlLoading = useReconstructionStore((s) => s.urlLoading);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  const hasSplatFile = useReconstructionStore((s) => Boolean(s.loadedFiles?.splatFile));
  const splatPsnrFrameReady = useImageMetricsStore((s) => s.splatPsnrFrameReady);
  const splatPsnrByImage = useImageMetricsStore((s) => s.splatPsnrMetrics);
  const fps = useUIStore((s) => s.fps);
  const autoHideButtons = useUIStore((s) => s.autoHideElements.buttons);
  const isIdle = useUIStore((s) => s.isIdle);
  const showAutoHideEditor = useUIStore((s) => s.showAutoHideEditor);
  const setShowHotkeyHelp = useUIStore((s) => s.setShowHotkeyHelp);
  const trainingStatus = useTrainingStore((s) => formatTrainingStatus(s.currentJob, s.phase));
  const setTrainingDockOpen = useTrainingStore((s) => s.setDockOpen);

  return {
    urlLoading,
    reconstruction,
    wasmReconstruction,
    hasSplatFile,
    splatPsnrFrameReady,
    splatPsnrByImage,
    fps,
    autoHideButtons,
    isIdle,
    showAutoHideEditor,
    setShowHotkeyHelp,
    trainingStatus,
    setTrainingDockOpen,
  };
}
