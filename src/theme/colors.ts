/**
 * Color constants for 3D visualization and canvas rendering.
 * UI colors should use CSS variables (--bg-*, --text-*, etc.) via Tailwind classes.
 */

// 3D Visualization colors (bright colors preserved for visibility on dark background)
export const VIZ_COLORS = {
  frustum: {
    default: '#ff0000',
    selected: '#ff00ff',
    hover: '#6699aa',
    deleted: '#ff4444',  // Red for pending deletion
  },
  point: {
    triangulated: '#00ff00',
    untriangulated: '#ff0000',
  },
  axis: {
    x: 0xe60000,            // Red - X axis
    y: 0x00e600,            // Green - Y axis
    z: 0x0000e6,            // Blue - Z axis
  },
  match: '#ff00ff',
  highlight: [1, 0, 1] as const,  // RGB for shader uniforms (magenta)
  wireframe: '#333333',
} as const;

// sRGB linearization constants (for accurate color space conversion)
export const SRGB = {
  threshold: 0.04045,
  linearScale: 12.92,
  gammaOffset: 0.055,
  gammaScale: 1.055,
  gamma: 2.4,
} as const;

// Rainbow animation color cycling
export const RAINBOW = {
  chroma: 0.8,
  lightness: 0.4,
  saturation: 1.0,
  speedMultiplier: 0.5,
  // Hue segment boundaries for HSL to RGB conversion
  hueSegments: {
    redToYellow: 1 / 6,
    yellowToGreen: 2 / 6,
    greenToCyan: 3 / 6,
    cyanToBlue: 4 / 6,
    blueToMagenta: 5 / 6,
  },
} as const;

// Jet colormap thresholds for error visualization
export const COLORMAP = {
  jet: {
    threshold1: 0.25,
    threshold2: 0.5,
    threshold3: 0.75,
    multiplier: 4,
  },
  trackLength: {
    baseR: 0.1,
    rangeR: 0.1,
    baseG: 0.1,
    rangeG: 0.9,
    baseB: 0.5,
    rangeB: 0.2,
  },
} as const;

// Brightness constants for background toggle
export const BRIGHTNESS = {
  midpoint: 128,
  max: 255,
} as const;

// Distinct color palette for camera frustums (perceptually distinct, high saturation)
export const FRUSTUM_COLORS = [
  '#e6194b', // red
  '#3cb44b', // green
  '#ffe119', // yellow
  '#4363d8', // blue
  '#f58231', // orange
  '#911eb4', // purple
  '#42d4f4', // cyan
  '#f032e6', // magenta
  '#bfef45', // lime
  '#fabed4', // pink
  '#469990', // teal
  '#dcbeff', // lavender
  '#9a6324', // brown
  '#fffac8', // beige
  '#800000', // maroon
  '#aaffc3', // mint
  '#808000', // olive
  '#ffd8b1', // apricot
  '#000075', // navy
  '#a9a9a9', // gray
] as const;

// Get a distinct color for a camera by index (wraps around if more cameras than colors)
export function getCameraColor(index: number): string {
  return FRUSTUM_COLORS[index % FRUSTUM_COLORS.length];
}
