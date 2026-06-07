import { parseSafeIntegerString } from '../../utils/numberParsing';
import type { CameraFilter, SortField } from './imageGalleryDataViewModel';

interface GalleryCameraFilterOption {
  cameraId: number;
}

interface GallerySortFieldOption {
  value: SortField;
  label: string;
}

export const GALLERY_SORT_FIELD_OPTIONS: GallerySortFieldOption[] = [
  { value: 'name', label: 'Sort: Name' },
  { value: 'imageId', label: 'Sort: Image ID' },
  { value: 'avgError', label: 'Sort: Avg Error' },
  { value: 'covisibleCount', label: 'Sort: Covisible' },
  { value: 'numPoints3D', label: 'Sort: 3D Points' },
  { value: 'numPoints2D', label: 'Sort: 2D Points' },
];

const SPLAT_PSNR_SORT_FIELD_OPTION: GallerySortFieldOption = {
  value: 'splatPsnr',
  label: 'Sort: PSNR',
};

const SPLAT_SSIM_SORT_FIELD_OPTION: GallerySortFieldOption = {
  value: 'splatSsim',
  label: 'Sort: SSIM',
};

export function getGallerySortFieldOptions(hasSplatMetrics: boolean): GallerySortFieldOption[] {
  return [
    ...GALLERY_SORT_FIELD_OPTIONS,
    ...(hasSplatMetrics ? [SPLAT_PSNR_SORT_FIELD_OPTION, SPLAT_SSIM_SORT_FIELD_OPTION] : []),
  ];
}

export function getGallerySortFieldValue(value: string, hasSplatMetrics = false): SortField | null {
  return getGallerySortFieldOptions(hasSplatMetrics).find(option => option.value === value)?.value ?? null;
}

export function getGalleryCameraFilterValue(
  value: string,
  cameras: readonly GalleryCameraFilterOption[]
): CameraFilter | null {
  if (value === 'all') return 'all';

  const cameraId = parseSafeIntegerString(value);
  if (cameraId === null) return null;

  return cameras.some(camera => camera.cameraId === cameraId) ? cameraId : null;
}
