/**
 * Modal for configuring which 3D elements auto-hide during idle.
 * Layout mirrors the context menu editor: icon + label + toggle switch rows.
 */

import { memo, useCallback, type ReactNode } from 'react';
import { useModalZIndex } from '../../hooks/useModalZIndex';
import { useModalDrag } from '../../hooks/useModalDrag';
import { modalStyles } from '../../theme';
import { FloatingWindowShell } from '../ui/FloatingWindowShell';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import {
  AxesIcon,
  GridIcon,
  TransformIcon,
  ColorRgbIcon,
  FrustumIcon,
  MatchOnIcon,
  RigIcon,
  SettingsIcon,
} from '../../icons';
import {
  AUTO_HIDE_MODAL_DESCRIPTION,
  AUTO_HIDE_MODAL_DONE_LABEL,
  AUTO_HIDE_MODAL_ESTIMATED_HEIGHT,
  AUTO_HIDE_MODAL_TITLE,
  AUTO_HIDE_MODAL_WIDTH,
  getAutoHideModalBodyStyle,
  getAutoHideModalHeaderDragStyle,
  getAutoHideModalOverlayStyle,
  getAutoHideModalPanelStyle,
  getAutoHideModalRows,
  getNextAutoHideElementValue,
  type AutoHideModalIconId,
} from './autoHideModalViewModel';
import { useAutoHideModalStoreFacade } from './useAutoHideModalStoreFacade';

const AUTO_HIDE_MODAL_ICONS: Record<AutoHideModalIconId, ReactNode> = {
  settings: <SettingsIcon className="w-4 h-4" />,
  axes: <AxesIcon className="w-4 h-4" />,
  grid: <GridIcon className="w-4 h-4" />,
  gizmo: <TransformIcon className="w-4 h-4" />,
  points: <ColorRgbIcon className="w-4 h-4" />,
  cameras: <FrustumIcon className="w-4 h-4" />,
  matches: <MatchOnIcon className="w-4 h-4" />,
  rigs: <RigIcon className="w-4 h-4" />,
};

interface AutoHideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AutoHideModal = memo(function AutoHideModal({ isOpen, onClose }: AutoHideModalProps) {
  const {
    data: { autoHideElements },
    actions: { setAutoHideElement },
  } = useAutoHideModalStoreFacade();

  const { zIndex, bringToFront } = useModalZIndex(isOpen);
  const { position, panelRef, handleDragStart } = useModalDrag({
    estimatedWidth: AUTO_HIDE_MODAL_WIDTH,
    estimatedHeight: AUTO_HIDE_MODAL_ESTIMATED_HEIGHT,
    isOpen,
  });
  const rows = getAutoHideModalRows(autoHideElements);

  const toggleElement = useCallback((key: (typeof rows)[number]['key']) => {
    setAutoHideElement(key, getNextAutoHideElementValue(autoHideElements, key));
  }, [autoHideElements, setAutoHideElement]);

  if (!isOpen) return null;

  return (
    <FloatingWindowShell
      isOpen={isOpen}
      title={AUTO_HIDE_MODAL_TITLE}
      onClose={onClose}
      panelRef={panelRef}
      overlayStyle={getAutoHideModalOverlayStyle(zIndex)}
      panelStyle={getAutoHideModalPanelStyle(position)}
      headerStyle={getAutoHideModalHeaderDragStyle()}
      onPanelPointerDown={bringToFront}
      onHeaderPointerDown={handleDragStart}
    >
        {/* Body */}
        <div className="p-4 overflow-y-auto" style={getAutoHideModalBodyStyle()}>
          <div className="text-ds-secondary text-xs mb-3">
            {AUTO_HIDE_MODAL_DESCRIPTION}
          </div>

          <div className="flex flex-col">
            {rows.map(({ key, label, iconId, checked }) => (
              <label
                key={key}
                className="flex items-center gap-2 cursor-pointer hover-ds-hover rounded px-2 py-1.5"
              >
                <span className="w-4 h-4 flex-shrink-0 opacity-60">
                  {AUTO_HIDE_MODAL_ICONS[iconId]}
                </span>
                <span className="text-sm text-ds-primary">{label}</span>
                <span className="ml-auto">
                  <ToggleSwitch
                    checked={checked}
                    onChange={() => toggleElement(key)}
                  />
                </span>
              </label>
            ))}
          </div>

          <div className="mt-4 pt-3">
            <button
              onClick={onClose}
              className={modalStyles.actionButtonPrimary}
            >
              {AUTO_HIDE_MODAL_DONE_LABEL}
            </button>
          </div>
        </div>
    </FloatingWindowShell>
  );
});
