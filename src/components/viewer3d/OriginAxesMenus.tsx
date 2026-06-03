import { memo, useCallback, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useAxesNodeActions } from '../../nodes';
import { useClickOutside } from '../../hooks/useClickOutside';
import { contextMenuStyles } from '../../theme';
import { CheckIcon, HideIcon } from '../../icons';
import type { AxesCoordinateSystem, AxisLabelMode } from '../../store/types';
import {
  ALL_COORDINATE_SYSTEMS,
  ALL_LABEL_MODES,
  checkIconClass,
  COORDINATE_SYSTEM_NAMES,
} from './originAxesConstants';
import { calculateFixedHtmlPosition, getFixedContextMenuHtmlStyle } from './htmlOverlayStylePolicy';
import {
  stopContextMenuSurfaceMouseEvent,
  stopContextMenuSurfacePointerEvent,
  suppressContextMenuSurfaceContextMenu,
} from './contextMenu/contextMenuDomEvents';

export interface MenuPosition {
  x: number;
  y: number;
}

interface LabelsMenuProps {
  position: MenuPosition;
  currentLabelMode: AxisLabelMode;
  onClose: () => void;
}

export const LabelsMenu = memo(function LabelsMenu({
  position,
  currentLabelMode,
  onClose,
}: LabelsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const axesActions = useAxesNodeActions();
  const setAxisLabelMode = axesActions.setLabelMode;
  const setShowAxes = axesActions.setVisible;

  useClickOutside(menuRef, onClose);

  const handleLabelChange = useCallback((mode: AxisLabelMode) => {
    setAxisLabelMode(mode);
    onClose();
  }, [setAxisLabelMode, onClose]);

  const handleHideAxes = useCallback(() => {
    setShowAxes(false);
    onClose();
  }, [setShowAxes, onClose]);

  return (
    <Html
      style={getFixedContextMenuHtmlStyle(position)}
      calculatePosition={calculateFixedHtmlPosition}
    >
      <div
        ref={menuRef}
        className={contextMenuStyles.container}
        onPointerDown={stopContextMenuSurfacePointerEvent}
        onMouseDown={stopContextMenuSurfaceMouseEvent}
        onContextMenu={suppressContextMenuSurfaceContextMenu}
      >
        {ALL_LABEL_MODES.map((mode) => (
          <button
            key={mode.value}
            className={contextMenuStyles.button}
            onClick={() => handleLabelChange(mode.value)}
          >
            {currentLabelMode === mode.value ? <CheckIcon className={checkIconClass} /> : <span className="w-4" />}
            {mode.label}
          </button>
        ))}
        <div className="border-t border-ds my-1" />
        <button className={contextMenuStyles.button} onClick={handleHideAxes}>
          <HideIcon className={contextMenuStyles.icon} />
          Hide
        </button>
      </div>
    </Html>
  );
});

interface SystemMenuProps {
  position: MenuPosition;
  currentSystem: AxesCoordinateSystem;
  onClose: () => void;
}

export const SystemMenu = memo(function SystemMenu({
  position,
  currentSystem,
  onClose,
}: SystemMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const axesActions = useAxesNodeActions();
  const setAxesCoordinateSystem = axesActions.setCoordinateSystem;

  useClickOutside(menuRef, onClose);

  const handleSystemChange = useCallback((system: AxesCoordinateSystem) => {
    setAxesCoordinateSystem(system);
    onClose();
  }, [setAxesCoordinateSystem, onClose]);

  return (
    <Html
      style={getFixedContextMenuHtmlStyle(position)}
      calculatePosition={calculateFixedHtmlPosition}
    >
      <div
        ref={menuRef}
        className={contextMenuStyles.container}
        onPointerDown={stopContextMenuSurfacePointerEvent}
        onMouseDown={stopContextMenuSurfaceMouseEvent}
        onContextMenu={suppressContextMenuSurfaceContextMenu}
      >
        {ALL_COORDINATE_SYSTEMS.map((sys) => (
          <button
            key={sys}
            className={contextMenuStyles.button}
            onClick={() => handleSystemChange(sys)}
          >
            {currentSystem === sys ? <CheckIcon className={checkIconClass} /> : <span className="w-4" />}
            {COORDINATE_SYSTEM_NAMES[sys]}
          </button>
        ))}
      </div>
    </Html>
  );
});
