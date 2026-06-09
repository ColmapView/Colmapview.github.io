export const GALLERY_VIEW_MODES = ['gallery', 'list'] as const;
export type GalleryViewMode = (typeof GALLERY_VIEW_MODES)[number];

export const GALLERY_VIEW_MODE_SETTINGS = ['auto', ...GALLERY_VIEW_MODES] as const;
export type GalleryViewModeSetting = (typeof GALLERY_VIEW_MODE_SETTINGS)[number];

export const GALLERY_BORDER_COLOR_MODES = ['none', 'camera', 'psnr', 'ssim'] as const;
export type GalleryBorderColorMode = (typeof GALLERY_BORDER_COLOR_MODES)[number];

export const GALLERY_BORDER_COLOR_MODE_SETTINGS = ['auto', ...GALLERY_BORDER_COLOR_MODES] as const;
export type GalleryBorderColorModeSetting = (typeof GALLERY_BORDER_COLOR_MODE_SETTINGS)[number];

export const GALLERY_THUMBNAIL_DISPLAY_MODES = [
  'image',
  'maskedImage',
  'inverseMaskedImage',
  'mask',
  'hoverMask',
] as const;
export type GalleryThumbnailDisplayMode = (typeof GALLERY_THUMBNAIL_DISPLAY_MODES)[number];

export const GALLERY_SORT_FIELDS = [
  'name',
  'imageId',
  'avgError',
  'covisibleCount',
  'numPoints3D',
  'numPoints2D',
  'splatPsnr',
  'splatSsim',
] as const;
export type GallerySortField = (typeof GALLERY_SORT_FIELDS)[number];

export const GALLERY_SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type GallerySortDirection = (typeof GALLERY_SORT_DIRECTIONS)[number];

export type GalleryCameraFilter = number | 'all';

export const DEFAULT_GALLERY_COLUMNS = 2;
