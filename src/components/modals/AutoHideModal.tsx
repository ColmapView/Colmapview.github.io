/**
 * Modal for configuring which 3D elements auto-hide during idle.
 * Layout mirrors the context menu editor: icon + label + toggle switch rows.
 */

import { memo, useCallback } from 'react';
import { useUIStore } from '../../store';
import type { AutoHideElement } from '../../store/stores/uiStore';
import { useModalZIndex } from '../../hooks/useModalZIndex';
import { useModalDrag } from '../../hooks/useModalDrag';
import { modalStyles } from '../../theme';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import {
  CloseIcon,
  AxesIcon,
  GridIcon,
  TransformIcon,
  ColorRgbIcon,
  FrustumIcon,
  MatchOnIcon,
  RigIcon,
  SettingsIcon,
} from '../../icons';

interface ElementDef {
  key: AutoHideElement;
  label: string;
  icon: React.ReactNode;
}

const ELEMENTS: ElementDef[] = [
  { key: 'buttons', label: 'Buttons', icon: <SettingsIcon className="w-4 h-4" /> },
  { key: 'axes', label: 'Axes', icon: <AxesIcon className="w-4 h-4" /> },
  { key: 'grid', label: 'Grid', icon: <GridIcon className="w-4 h-4" /> },
  { key: 'gizmo', label: 'Gizmo', icon: <TransformIcon className="w-4 h-4" /> },
  { key: 'points', label: 'Points', icon: <ColorRgbIcon className="w-4 h-4" /> },
  { key: 'cameras', label: 'Cameras', icon: <FrustumIcon className="w-4 h-4" /> },
  { key: 'matches', label: 'Matches', icon: <MatchOnIcon className="w-4 h-4" /> },
  { key: 'rigs', label: 'Rigs', icon: <RigIcon className="w-4 h-4" /> },
];

interface AutoHideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AutoHideModal = memo(function AutoHideModal({ isOpen, onClose }: AutoHideModalProps) {
  const autoHideElements = useUIStore((s) => s.autoHideElements);
  const setAutoHideElement = useUIStore((s) => s.setAutoHideElement);

  const { zIndex, bringToFront } = useModalZIndex(isOpen);
  const { position, panelRef, handleDragStart } = useModalDrag({
    estimatedWidth: 240,
    estimatedHeight: 400,
    isOpen,
  });

  const toggleElement = useCallback((key: AutoHideElement) => {
    setAutoHideElement(key, !autoHideElements[key]);
  }, [autoHideElements, setAutoHideElement]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
      <div
        ref={panelRef}
        className={modalStyles.toolPanel}
        style={{ left: position.x, top: position.y, width: 240 }}
        onPointerDown={bringToFront}
      >
        {/* Header */}
        <div
          className={modalStyles.toolHeader}
          onPointerDown={handleDragStart}
          style={{ touchAction: 'none' }}
        >
          <span className={modalStyles.toolHeaderTitle}>Auto-hide Elements</span>
          <button
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className={modalStyles.toolHeaderClose}
            title="Close"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 120px)' }}>
          <div className="text-ds-secondary text-xs mb-3">
            Select which elements hide when idle.
          </div>

          <div className="flex flex-col">
            {ELEMENTS.map(({ key, label, icon }) => (
              <label
                key={key}
                className="flex items-center gap-2 cursor-pointer hover-ds-hover rounded px-2 py-1.5"
              >
                <span className="w-4 h-4 flex-shrink-0 opacity-60">{icon}</span>
                <span className="text-sm text-ds-primary">{label}</span>
                <span className="ml-auto">
                  <ToggleSwitch
                    checked={autoHideElements[key]}
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
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
