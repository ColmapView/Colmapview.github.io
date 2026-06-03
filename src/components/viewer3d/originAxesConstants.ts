import { GRID_COLORS } from '../../theme';
import type { AxesCoordinateSystem, AxisLabelMode } from '../../store/types';

export const NEGATIVE_AXIS_COLOR = GRID_COLORS.negativeAxis;

export const COORDINATE_SYSTEM_NAMES: Record<AxesCoordinateSystem, string> = {
  colmap: 'COLMAP',
  opencv: 'OpenCV',
  threejs: 'Three.js',
  opengl: 'OpenGL',
  vulkan: 'Vulkan',
  blender: 'Blender',
  houdini: 'Houdini',
  unity: 'Unity',
  unreal: 'Unreal',
};

export const ALL_COORDINATE_SYSTEMS: AxesCoordinateSystem[] = [
  'colmap',
  'opencv',
  'threejs',
  'opengl',
  'vulkan',
  'blender',
  'houdini',
  'unity',
  'unreal',
];

export const ALL_LABEL_MODES: { value: AxisLabelMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'xyz', label: 'XYZ' },
  { value: 'extra', label: 'Extra' },
];

export const checkIconClass = 'w-4 h-4 text-ds-accent';
