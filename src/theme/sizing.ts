/**
 * Size constants for consistent component dimensions.
 * Values are in pixels unless otherwise noted.
 */

export const SIZE = {
  // Gallery
  listRowHeight: 72,
  listItemWidth: 250,       // Target width for list items
  thumbnailSize: 48,        // w-12 h-12 (12 * 4px)
  defaultCellWidth: 150,
  defaultCellHeight: 100,

  // Controls
  controlButton: 64,        // w-16 h-16 (16 * 4px)
  panelMinWidth: 220,
  labelWidth: 80,           // w-20 (20 * 4px)
  valueWidth: 32,           // w-8 (8 * 4px)
  sliderWidth: 112,         // w-28 (28 * 4px)

  // Modal
  modalMinWidth: 400,
  modalMinHeight: 300,
  resizeHandle: 12,         // w-3 h-3 (3 * 4px)

  // 3D Camera/Texture
  thumbnailMaxSize: 1280,   // Max dimension for frustum thumbnails
  maxConcurrentLoads: 6,    // Concurrent texture loads

  // Data limits
  galleryImageLimit: 100,   // Max images to display in gallery (virtualized)

  // Footer
  logoHeight: '5vh',        // Viewport-relative logo height
} as const;

/**
 * Icon size Tailwind classes for consistent icon dimensions.
 */
export const ICON_SIZES = {
  control: 'w-6 h-6',       // Control panel buttons (24px)
  hoverCard: 'w-3.5 h-3.5', // Hover card hint icons (14px)
  social: 'w-8 h-8',        // Social links (32px)
  socialSm: 'w-7 h-7',      // Smaller social icons (28px)
} as const;

export const COLUMNS = {
  min: 1,
  max: 10,
  default: 3,
} as const;

export const ASPECT_RATIO = {
  landscape: 1.5,           // 3:2 default for camera images
} as const;
