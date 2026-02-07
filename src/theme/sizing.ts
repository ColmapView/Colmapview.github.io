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
  maxWidthPercent: 0.85,      // Max 85% of viewport width
  maxHeightPercent: 0.85,     // Max 85% of viewport height
  headerHeight: 40,           // Approx header height in px
  footerHeight: 50,           // Approx footer/controls height in px
  padding: 32,                // Modal internal padding (px-4 * 2)
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

/**
 * Touch mode constants for touch-optimized UI.
 * Used when touchMode is active (tablets, touch laptops).
 */
export const TOUCH = {
  // Tap targets (Apple HIG / Material Design guidelines)
  minTapTarget: 44,         // Minimum touch target in px
  preferredTapTarget: 48,   // Preferred touch target in px

  // UI component sizes
  statusBarHeight: 24,      // Simplified status bar height
  fabSize: 44,              // Primary FAB diameter (min tap target)
  fabSecondarySize: 40,     // Secondary FAB diameter (matches desktop controls)

  // Panel dimensions
  drawerWidth: 320,         // Gallery drawer width (max)
  bottomSheetMinHeight: 160, // Minimum bottom sheet peek height
  gestureZone: 20,          // Edge swipe detection zone in px

  // Gesture thresholds
  longPressDelay: 500,      // Long press detection in ms
  doubleTapDelay: 300,      // Double tap detection in ms
  dragThreshold: 10,        // Pixels before recognizing drag
  pinchThreshold: 0.02,     // Scale delta before recognizing pinch

  // 3D interaction
  hitTargetScale: 2.5,      // Multiplier for frustum hit targets on touch
  orbitSensitivity: 1.5,    // Touch orbit sensitivity multiplier
  panSensitivity: 1.0,      // Touch pan sensitivity multiplier
  zoomSensitivity: 0.5,     // Touch zoom sensitivity multiplier
} as const;

/**
 * Phone vs tablet breakpoint.
 * Phones (<640px) show "Desktop Only" message.
 * Tablets (640-1080px) get touch mode UI.
 */
export const TOUCH_BREAKPOINTS = {
  phone: 640,               // Below this = phone (blocked)
  tablet: 1080,             // Below this = tablet (touch mode)
} as const;
