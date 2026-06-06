import type {
  CameraDisplayMode,
  CameraScaleFactor,
  FrustumColorMode,
} from '../../../store/types';

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface CameraDisplayHint {
  title: string;
  lines: [string, string];
}

export const CAMERA_DISPLAY_MODE_OPTIONS: SelectOption<CameraDisplayMode>[] = [
  { value: 'frustum', label: 'Frustum' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'imageplane', label: 'Image Plane' },
];

export const CAMERA_SCALE_FACTOR_OPTIONS: SelectOption<CameraScaleFactor>[] = [
  { value: '0.1', label: '0.1×' },
  { value: '1', label: '1×' },
  { value: '10', label: '10×' },
];

const BASE_FRUSTUM_COLOR_MODE_OPTIONS: SelectOption<FrustumColorMode>[] = [
  { value: 'single', label: 'Single' },
  { value: 'byCamera', label: 'By Cam' },
];

const RIG_FRAME_COLOR_MODE_OPTION: SelectOption<FrustumColorMode> = {
  value: 'byRigFrame',
  label: 'By Frame',
};

const SPLAT_PSNR_COLOR_MODE_OPTION: SelectOption<FrustumColorMode> = {
  value: 'splatPsnr',
  label: 'PSNR',
};

const CAMERA_DISPLAY_HINTS: Record<CameraDisplayMode, CameraDisplayHint> = {
  frustum: {
    title: 'Frustum:',
    lines: ['Full camera frustum', 'pyramid wireframes.'],
  },
  arrow: {
    title: 'Arrow:',
    lines: ['Simple arrow showing', 'camera look direction.'],
  },
  imageplane: {
    title: 'Image Plane:',
    lines: ['Shows image textures', 'on camera planes.'],
  },
};

export function getSupportedCameraDisplayMode(value: string): CameraDisplayMode | null {
  if (value === 'frustum' || value === 'arrow' || value === 'imageplane') return value;
  return null;
}

export function getFrustumColorModeOptions({
  hasRigData,
  hasSplatPsnr,
}: {
  hasRigData: boolean;
  hasSplatPsnr: boolean;
}): SelectOption<FrustumColorMode>[] {
  return [
    ...BASE_FRUSTUM_COLOR_MODE_OPTIONS,
    ...(hasRigData ? [RIG_FRAME_COLOR_MODE_OPTION] : []),
    ...(hasSplatPsnr ? [SPLAT_PSNR_COLOR_MODE_OPTION] : []),
  ];
}

export function getCameraDisplayHint(mode: CameraDisplayMode | string): CameraDisplayHint {
  return CAMERA_DISPLAY_HINTS[getSupportedCameraDisplayMode(mode) ?? 'frustum'];
}
