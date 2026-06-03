import { createElement, type ComponentType, type ReactNode } from 'react';
import {
  ArrowIcon,
  AxesGridIcon,
  AxesIcon,
  AxesOffIcon,
  CameraOffIcon,
  ColorErrorIcon,
  ColorOffIcon,
  ColorRgbIcon,
  ColorSplatIcon,
  ColorTrackIcon,
  FlyIcon,
  FrustumIcon,
  GridIcon,
  ImageIcon,
  MatchBlinkIcon,
  MatchOffIcon,
  MatchOnIcon,
  OrbitIcon,
  RainbowIcon,
  RigBlinkIcon,
  RigIcon,
  RigOffIcon,
  SelectionBlinkIcon,
  SelectionOffIcon,
  SelectionStaticIcon,
} from '../../icons';
import type {
  AxesGridButtonIcon,
  CameraDisplayButtonIcon,
  CameraModeButtonIcon,
  MatchesButtonIcon,
  PointCloudButtonIcon,
  RigButtonIcon,
  SelectionButtonIcon,
} from './viewerControlsViewModel';

const CONTROL_ICON_CLASS_NAME = 'w-6 h-6';

function icon(component: ComponentType<{ className?: string }>): ReactNode {
  return createElement(component, { className: CONTROL_ICON_CLASS_NAME });
}

export function renderAxesGridButtonIcon(iconKind: AxesGridButtonIcon): ReactNode {
  switch (iconKind) {
    case 'axesGrid':
      return icon(AxesGridIcon);
    case 'axes':
      return icon(AxesIcon);
    case 'grid':
      return icon(GridIcon);
    case 'axesOff':
      return icon(AxesOffIcon);
  }
}

export function renderCameraModeButtonIcon(iconKind: CameraModeButtonIcon): ReactNode {
  return iconKind === 'orbit' ? icon(OrbitIcon) : icon(FlyIcon);
}

export function renderPointCloudButtonIcon(iconKind: PointCloudButtonIcon): ReactNode {
  switch (iconKind) {
    case 'pointsOff':
      return icon(ColorOffIcon);
    case 'pointsRgb':
      return icon(ColorRgbIcon);
    case 'pointsError':
      return icon(ColorErrorIcon);
    case 'pointsTrack':
      return icon(ColorTrackIcon);
    case 'pointsSplats':
      return icon(ColorSplatIcon);
  }
}

export function renderCameraDisplayButtonIcon(iconKind: CameraDisplayButtonIcon): ReactNode {
  switch (iconKind) {
    case 'cameraOff':
      return icon(CameraOffIcon);
    case 'frustum':
      return icon(FrustumIcon);
    case 'arrow':
      return icon(ArrowIcon);
    case 'imageplane':
      return icon(ImageIcon);
  }
}

export function renderMatchesButtonIcon(iconKind: MatchesButtonIcon): ReactNode {
  switch (iconKind) {
    case 'matchesOff':
      return icon(MatchOffIcon);
    case 'matchesStatic':
      return icon(MatchOnIcon);
    case 'matchesBlink':
      return icon(MatchBlinkIcon);
  }
}

export function renderSelectionButtonIcon(iconKind: SelectionButtonIcon): ReactNode {
  switch (iconKind) {
    case 'selectionOff':
      return icon(SelectionOffIcon);
    case 'selectionStatic':
      return icon(SelectionStaticIcon);
    case 'selectionBlink':
      return icon(SelectionBlinkIcon);
    case 'selectionRainbow':
      return icon(RainbowIcon);
  }
}

export function renderRigButtonIcon(iconKind: RigButtonIcon): ReactNode {
  switch (iconKind) {
    case 'rigOff':
      return icon(RigOffIcon);
    case 'rigStatic':
      return icon(RigIcon);
    case 'rigBlink':
      return icon(RigBlinkIcon);
  }
}
