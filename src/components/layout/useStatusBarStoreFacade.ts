import { useReconstructionStore } from '../../store/reconstructionStore';
import { useImageMetricsStore } from '../../store/stores/imageMetricsStore';
import { useUIStore } from '../../store/stores/uiStore';

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
  };
}
