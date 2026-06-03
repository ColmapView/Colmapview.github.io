import { memo } from 'react';
import {
  SidebarCollapseIcon,
  SidebarExpandIcon,
} from '../../../icons';
import {
  ControlButton,
  type PanelType,
} from '../ControlComponents';
import { getGalleryToggleButtonState } from './galleryToggleButtonViewModel';
import { useGalleryToggleButtonStoreFacade } from './useGalleryToggleButtonStoreFacade';

export interface GalleryToggleButtonProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

export const GalleryToggleButton = memo(function GalleryToggleButton({
  activePanel,
  setActivePanel,
}: GalleryToggleButtonProps) {
  const {
    data: {
      galleryCollapsed,
      embedMode,
      touchMode,
      touchGalleryDrawer,
    },
    actions: {
      toggleGalleryCollapsed,
      toggleTouchGalleryDrawer,
    },
  } = useGalleryToggleButtonStoreFacade();

  const buttonState = getGalleryToggleButtonState({
    embedMode,
    touchMode,
    galleryCollapsed,
    touchGalleryDrawer,
  });

  if (!buttonState.isVisible) return null;

  const handleClick = buttonState.action === 'toggleTouchGalleryDrawer'
    ? toggleTouchGalleryDrawer
    : toggleGalleryCollapsed;

  return (
    <ControlButton
      panelId="gallery"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={
        buttonState.icon === 'collapse'
          ? <SidebarCollapseIcon className="w-6 h-6" />
          : <SidebarExpandIcon className="w-6 h-6" />
      }
      tooltip={buttonState.tooltip}
      isActive={buttonState.isOpen}
      onClick={handleClick}
    />
  );
});
