import { useUIStore } from '../../../store';

export interface GalleryToggleButtonStoreFacadeData {
  galleryCollapsed: boolean;
  embedMode: boolean;
  touchMode: boolean;
  touchGalleryDrawer: boolean;
}

export interface GalleryToggleButtonStoreFacadeActions {
  toggleGalleryCollapsed: () => void;
  toggleTouchGalleryDrawer: () => void;
}

export interface GalleryToggleButtonStoreFacade {
  data: GalleryToggleButtonStoreFacadeData;
  actions: GalleryToggleButtonStoreFacadeActions;
}

export function useGalleryToggleButtonStoreFacade(): GalleryToggleButtonStoreFacade {
  const galleryCollapsed = useUIStore((s) => s.galleryCollapsed);
  const toggleGalleryCollapsed = useUIStore((s) => s.toggleGalleryCollapsed);
  const embedMode = useUIStore((s) => s.embedMode);
  const touchMode = useUIStore((s) => s.touchMode);
  const touchGalleryDrawer = useUIStore((s) => s.touchUI.galleryDrawer);
  const toggleTouchUI = useUIStore((s) => s.toggleTouchUI);

  return {
    data: {
      galleryCollapsed,
      embedMode,
      touchMode,
      touchGalleryDrawer,
    },
    actions: {
      toggleGalleryCollapsed,
      toggleTouchGalleryDrawer: () => toggleTouchUI('galleryDrawer'),
    },
  };
}
