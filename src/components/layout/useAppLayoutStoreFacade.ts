import { useGuideStore } from '../../store/stores/guideStore';
import { useUIStore, type TouchUIVisibility } from '../../store/stores/uiStore';
import { useReconstructionStore } from '../../store/reconstructionStore';

export interface AppLayoutStoreFacadeData {
  galleryCollapsed: boolean;
  embedMode: boolean;
  touchMode: boolean;
  touchUI: TouchUIVisibility;
  reconstruction: ReturnType<typeof useReconstructionStore.getState>['reconstruction'];
  urlLoading: boolean;
}

export interface AppLayoutStoreFacadeActions {
  setTouchUIVisible: (element: keyof TouchUIVisibility, visible: boolean) => void;
  showGuideTip: (tipId: string, message: string) => boolean;
}

export interface AppLayoutStoreFacade {
  data: AppLayoutStoreFacadeData;
  actions: AppLayoutStoreFacadeActions;
}

export function useAppLayoutStoreFacade(): AppLayoutStoreFacade {
  const galleryCollapsed = useUIStore((s) => s.galleryCollapsed);
  const embedMode = useUIStore((s) => s.embedMode);
  const touchMode = useUIStore((s) => s.touchMode);
  const touchUI = useUIStore((s) => s.touchUI);
  const setTouchUIVisible = useUIStore((s) => s.setTouchUIVisible);

  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const urlLoading = useReconstructionStore((s) => s.urlLoading);

  const showGuideTip = useGuideStore((s) => s.showTip);

  return {
    data: {
      galleryCollapsed,
      embedMode,
      touchMode,
      touchUI,
      reconstruction,
      urlLoading,
    },
    actions: {
      setTouchUIVisible,
      showGuideTip,
    },
  };
}
