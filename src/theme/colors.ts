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
  interaction: {
    axisX: '#ff4444',
    axisY: '#44ff44',
    axisZ: '#4444ff',
    hover: '#ffff00',
  },
  material: {
    white: 0xffffff,     // Neutral white for textured meshes and center spheres
  },
  match: '#ff00ff',
  highlight: [1, 0, 1] as const,  // RGB for shader uniforms (magenta)
  wireframe: '#333333',
} as const;

/** Convert a CSS hex color string to a Three.js integer (e.g. '#ff4444' -> 0xff4444) */
export function hexToInt(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** Axis colors for 3D interaction widgets (point markers, floor plane, picking cursor) */
export const INTERACTION_AXIS_COLORS: Record<string, { hex: number; css: string }> = {
  X: { hex: hexToInt(VIZ_COLORS.interaction.axisX), css: VIZ_COLORS.interaction.axisX },
  Y: { hex: hexToInt(VIZ_COLORS.interaction.axisY), css: VIZ_COLORS.interaction.axisY },
  Z: { hex: hexToInt(VIZ_COLORS.interaction.axisZ), css: VIZ_COLORS.interaction.axisZ },
} as const;

/** Hover highlight color as Three.js integer */
export const INTERACTION_HOVER_COLOR = hexToInt(VIZ_COLORS.interaction.hover);

/** Point marker colors: P1=red (X), P2=green (Y), P3=blue (Z) */
export const MARKER_COLORS_INT = [
  hexToInt(VIZ_COLORS.interaction.axisX),
  hexToInt(VIZ_COLORS.interaction.axisY),
  hexToInt(VIZ_COLORS.interaction.axisZ),
] as const;

/** Point colors as CSS strings for 2D overlays (PickingCursor) */
export const MARKER_COLORS_CSS = [
  VIZ_COLORS.interaction.axisX,
  VIZ_COLORS.interaction.axisY,
  VIZ_COLORS.interaction.axisZ,
] as const;

// Grid visualization colors (OriginVisualization infinite grid)
export const GRID_COLORS = {
  negativeAxis: 0x666666,
  majorLines: 0xffcc88,
  minorLines: 0x888888,
} as const;

// Chart/histogram colors for SVG-based visualizations (StatusBar tooltips)
export const CHART_COLORS = {
  bar: '#f59e0b',
  barBackground: 'rgba(255,255,255,0.05)',
  label: '#e5e7eb',
  percentage: '#fbbf24',
} as const;

// Canvas rendering colors (hardcoded because canvas can't read CSS variables)
export const CANVAS_COLORS = {
  bgVoid: '#0a0a0a',
  bgSecondary: '#161616',
  bgSecondaryOverlay: 'rgba(22, 22, 22, 0.85)',
  bgTertiary: '#1e1e1e',
  textPrimary: '#e8e8e8',
  textSecondary: '#8a8a8a',
  textMuted: '#5a5a5a',
  outline: '#000000',
  white: '#ffffff',
} as const;

// Status bar link hover colors (brand-specific)
export const LINK_COLORS = {
  github: '#facc15',
  bugs: '#ef4444',
  colmap: '#60a5fa',
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

/** Semantic status colors as Tailwind utility class names */
export const STATUS_COLORS = {
  success: 'text-green-400',
  info: 'text-blue-400',
  warning: 'text-amber-400',
  error: 'text-red-400',
  caution: 'text-orange-400',
  highlight: 'text-purple-400',
} as const;

/** Semantic status background colors as Tailwind utility class names */
export const STATUS_BG = {
  success: 'bg-green-400',
  info: 'bg-blue-400',
  warning: 'bg-amber-400',
  inactive: 'bg-neutral-600',
} as const;

/** Axis colors for UI icons (flat-UI palette, distinct from VIZ_COLORS.interaction) */
export const ICON_COLORS = {
  axisX: '#e74c3c',
  axisY: '#2ecc71',
  axisZ: '#3498db',
} as const;
