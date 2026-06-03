import type { AxesCoordinateSystem, AxisLabelMode } from '../../../store/types';
import { toSuperscript } from '../viewerControlsViewModel';

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export const AXES_COORDINATE_SYSTEM_OPTIONS: SelectOption<AxesCoordinateSystem>[] = [
  { value: 'colmap', label: 'COLMAP' },
  { value: 'opencv', label: 'OpenCV' },
  { value: 'threejs', label: 'Three.js' },
  { value: 'opengl', label: 'OpenGL' },
  { value: 'vulkan', label: 'Vulkan' },
  { value: 'blender', label: 'Blender' },
  { value: 'houdini', label: 'Houdini' },
  { value: 'unity', label: 'Unity' },
  { value: 'unreal', label: 'Unreal' },
];

export const AXIS_LABEL_MODE_OPTIONS: SelectOption<AxisLabelMode>[] = [
  { value: 'off', label: 'Off' },
  { value: 'xyz', label: 'XYZ' },
  { value: 'extra', label: 'Extra' },
];

export function scaleToLogSliderValue(scale: number): number {
  return Math.log10(scale);
}

export function logSliderValueToScale(value: number): number {
  return Math.pow(10, value);
}

export function formatLogScaleValue(value: number): string {
  return `10${toSuperscript(value)}`;
}
