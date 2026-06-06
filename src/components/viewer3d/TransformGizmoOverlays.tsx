import { useRef } from 'react';
import { Html } from '@react-three/drei';
import { CheckIcon, OffIcon, ReloadIcon, ResetIcon } from '../../icons';
import { useClickOutside } from '../../hooks/useClickOutside';
import {
  contextMenuStyles,
  hoverCardStyles,
  ICON_SIZES,
} from '../../theme';
import {
  calculateFixedHtmlPosition,
  getFixedContextMenuHtmlStyle,
  getFixedCursorHtmlStyle,
} from './htmlOverlayStylePolicy';
import {
  stopContextMenuSurfaceMouseEvent,
  stopContextMenuSurfacePointerEvent,
  suppressContextMenuSurfaceContextMenu,
} from './contextMenu/contextMenuDomEvents';
import type { GizmoAxis, GizmoMode } from './TransformGizmoHandles';

interface TransformGizmoHoverHintProps {
  axis: NonNullable<GizmoAxis>;
  mode: NonNullable<GizmoMode>;
  mousePos: { x: number; y: number };
}

export function TransformGizmoHoverHint({
  axis,
  mode,
  mousePos,
}: TransformGizmoHoverHintProps) {
  return (
    <Html
      style={getFixedCursorHtmlStyle(mousePos)}
      calculatePosition={calculateFixedHtmlPosition}
    >
      <div className={hoverCardStyles.container}>
        <div className={hoverCardStyles.title}>Transform Gizmo</div>
        <div className={hoverCardStyles.subtitle}>
          {axis.toUpperCase()}-axis • {mode}
        </div>
        <div className={hoverCardStyles.hint}>
          <div className={hoverCardStyles.hintRow}>
            <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="2" width="12" height="20" rx="6"/>
              <path d="M12 2v8"/>
              <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
            </svg>
            Drag: {mode}
          </div>
          <div className={hoverCardStyles.hintRow}>
            <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="2" width="12" height="20" rx="6"/>
              <path d="M12 2v8"/>
              <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
            </svg>
            Right: options
          </div>
        </div>
      </div>
    </Html>
  );
}

export interface GizmoContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onReset: () => void;
  onReload: () => void;
  onApply: () => void;
  onOff: () => void;
}

export function GizmoContextMenu({
  position,
  onClose,
  onReset,
  onReload,
  onApply,
  onOff,
}: GizmoContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, onClose);

  return (
    <Html
      style={getFixedContextMenuHtmlStyle(position)}
      calculatePosition={calculateFixedHtmlPosition}
    >
      <div
        ref={menuRef}
        className={contextMenuStyles.container}
        data-idle-pause="true"
        onPointerDown={stopContextMenuSurfacePointerEvent}
        onMouseDown={stopContextMenuSurfaceMouseEvent}
        onContextMenu={suppressContextMenuSurfaceContextMenu}
      >
        <button className={contextMenuStyles.button} onClick={onReset}>
          <ResetIcon className={contextMenuStyles.icon} />
          Reset
        </button>
        <button className={contextMenuStyles.button} onClick={onReload}>
          <ReloadIcon className={contextMenuStyles.icon} />
          Reload
        </button>
        <button className={contextMenuStyles.button} onClick={onApply}>
          <CheckIcon className={contextMenuStyles.icon} />
          Apply
        </button>
        <button className={contextMenuStyles.button} onClick={onOff}>
          <OffIcon className={contextMenuStyles.icon} />
          Off
        </button>
      </div>
    </Html>
  );
}
