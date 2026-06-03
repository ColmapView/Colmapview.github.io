export type GalleryToggleAction = 'toggleDesktopGallery' | 'toggleTouchGalleryDrawer';
export type GalleryToggleIcon = 'collapse' | 'expand';

export interface GalleryToggleButtonInput {
  embedMode: boolean;
  touchMode: boolean;
  galleryCollapsed: boolean;
  touchGalleryDrawer: boolean;
}

export interface GalleryToggleButtonState {
  isVisible: boolean;
  isOpen: boolean;
  icon: GalleryToggleIcon;
  tooltip: string;
  action: GalleryToggleAction | null;
}

export function getGalleryToggleButtonState({
  embedMode,
  touchMode,
  galleryCollapsed,
  touchGalleryDrawer,
}: GalleryToggleButtonInput): GalleryToggleButtonState {
  if (embedMode) {
    return {
      isVisible: false,
      isOpen: false,
      icon: 'expand',
      tooltip: 'Show gallery',
      action: null,
    };
  }

  const isOpen = touchMode ? touchGalleryDrawer : !galleryCollapsed;

  return {
    isVisible: true,
    isOpen,
    icon: isOpen ? 'collapse' : 'expand',
    tooltip: isOpen ? 'Hide gallery' : 'Show gallery',
    action: touchMode ? 'toggleTouchGalleryDrawer' : 'toggleDesktopGallery',
  };
}
