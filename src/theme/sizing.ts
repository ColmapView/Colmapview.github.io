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
  controlButton: 40,        // w-10 h-10 (10 * 4px)
  panelMinWidth: 220,
  labelWidth: 80,           // w-20 (20 * 4px)
  valueWidth: 32,           // w-8 (8 * 4px)
  sliderWidth: 112,         // w-28 (28 * 4px)

  // Modal
  modalMinWidth: 400,
  modalMinHeight: 300,
  resizeHandle: 12,         // w-3 h-3 (3 * 4px)

  // 3D Camera/Texture
  thumbnailMaxSize: 512,    // Max dimension for thumbnails (smaller = faster load)
  frustumMaxSize: 128,      // Max dimension for frustum textures (small for memory, adequate for 3D view)
  maxConcurrentLoads: 12,   // Concurrent texture loads (12 works well on modern browsers)
  minImagePlanePixels: 50,  // Min screen height in pixels to show image plane texture

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
  default: 2,
} as const;

export const ASPECT_RATIO = {
  landscape: 1.5,           // 3:2 default for camera images
} as const;

/**
 * Responsive breakpoints in pixels.
 */
export const BREAKPOINTS = {
  mobile: 1080,             // Below this width, use mobile layout
} as const;

/**
 * Modal default dimensions as viewport percentages.
 */
export const MODAL = {
  defaultWidthPercent: 0.9,   // 90% of viewport width
  defaultHeightPercent: 0.9,  // 90% of viewport height
} as const;

/**
 * Layout panel sizes for react-resizable-panels.
 * defaultSize is percentage, minSize is in pixels for reliable constraints.
 */
export const LAYOUT_PANELS = {
  viewer: {
    defaultSize: 70,        // 70% width
    minSize: '400px',       // 400px minimum
  },
  gallery: {
    defaultSize: 30,        // 30% width
    minSize: '300px',       // 300px minimum
  },
} as const;

/**
 * Screenshot watermark rendering values.
 */
export const SCREENSHOT = {
  logoHeightPercent: 0.05,  // 5% of canvas height
  paddingPercent: 0.02,     // 2% padding from edges
  logoAlpha: 0.7,           // Watermark opacity
} as const;
