import { memo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { contextMenuStyles } from '../../../theme';
import { getPointerEnabledHtmlStyle } from '../htmlOverlayStylePolicy';
import {
  stopContextMenuSurfaceMouseEvent,
  stopContextMenuSurfacePointerEvent,
  suppressContextMenuSurfaceContextMenu,
} from './contextMenuDomEvents';

interface FrustumContextMenuProps {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  planeDepth: number;
  planeWidth: number;
  planeHeight: number;
  onSelect: () => void;
  onGoto: () => void;
  onInfo: () => void;
  onClose: () => void;
}

export const FrustumContextMenu = memo(function FrustumContextMenu({
  position,
  quaternion,
  planeDepth,
  planeWidth,
  planeHeight,
  onSelect,
  onGoto,
  onInfo,
  onClose,
}: FrustumContextMenuProps) {
  return (
    <group position={position} quaternion={quaternion}>
      <Html
        position={[planeWidth / 2, planeHeight / 2, planeDepth]}
        style={getPointerEnabledHtmlStyle()}
      >
        <div
          className={contextMenuStyles.container}
          data-idle-pause="true"
          onMouseLeave={onClose}
          onPointerDown={stopContextMenuSurfacePointerEvent}
          onMouseDown={stopContextMenuSurfaceMouseEvent}
          onContextMenu={suppressContextMenuSurfaceContextMenu}
        >
          <button className={contextMenuStyles.button} onClick={onSelect}>
            <svg className={contextMenuStyles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3" fill="currentColor"/>
            </svg>
            Select
          </button>
          <button className={contextMenuStyles.button} onClick={onGoto}>
            <svg className={contextMenuStyles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            Go to
          </button>
          <button className={contextMenuStyles.button} onClick={onInfo}>
            <svg className={contextMenuStyles.icon} viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2.5"/>
              <rect x="9.5" y="10" width="5" height="12" rx="1"/>
            </svg>
            Info
          </button>
        </div>
      </Html>
    </group>
  );
});
