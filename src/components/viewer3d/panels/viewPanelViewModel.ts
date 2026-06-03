import type { ViewDirection } from '../../../store';
import type { CameraProjection } from '../../../store/types';

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface ViewDirectionButton {
  direction: ViewDirection;
  label: string;
  hotkey: string;
}

export const VIEW_PROJECTION_OPTIONS: SelectOption<CameraProjection>[] = [
  { value: 'perspective', label: 'Persp' },
  { value: 'orthographic', label: 'Ortho' },
];

export const VIEW_DIRECTION_BUTTON_ROWS: ViewDirectionButton[][] = [
  [
    { direction: 'x', label: '+X', hotkey: '1' },
    { direction: 'y', label: '+Y', hotkey: '2' },
    { direction: 'z', label: '+Z', hotkey: '3' },
  ],
  [
    { direction: '-x', label: '-X', hotkey: '4' },
    { direction: '-y', label: '-Y', hotkey: '5' },
    { direction: '-z', label: '-Z', hotkey: '6' },
  ],
];

export function shouldShowCameraFovSlider(cameraProjection: CameraProjection): boolean {
  return cameraProjection === 'perspective';
}

export function formatCameraFovValue(value: number): string {
  return `${value.toFixed(1)}°`;
}
