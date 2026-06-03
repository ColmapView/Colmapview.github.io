import * as THREE from 'three';
import { FrustumContextMenu } from './contextMenu/FrustumContextMenu';

export interface CameraFrustumContextMenuState {
  imageId: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  planeDepth: number;
  planeWidth: number;
  planeHeight: number;
}

interface CameraFrustumContextMenuOverlayProps {
  contextMenu: CameraFrustumContextMenuState | null;
  onSelect: () => void;
  onGoto: () => void;
  onInfo: () => void;
  onClose: () => void;
}

export function CameraFrustumContextMenuOverlay({
  contextMenu,
  onSelect,
  onGoto,
  onInfo,
  onClose,
}: CameraFrustumContextMenuOverlayProps) {
  if (!contextMenu) return null;

  return (
    <FrustumContextMenu
      position={contextMenu.position}
      quaternion={contextMenu.quaternion}
      planeDepth={contextMenu.planeDepth}
      planeWidth={contextMenu.planeWidth}
      planeHeight={contextMenu.planeHeight}
      onSelect={onSelect}
      onGoto={onGoto}
      onInfo={onInfo}
      onClose={onClose}
    />
  );
}
