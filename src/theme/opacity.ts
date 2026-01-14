/**
 * Opacity and line width constants for consistent visual styling.
 */

export const OPACITY = {
  dimmed: 0.3,
  overlay: 0.5,
  matchLines: 0.7,
  sliderStep: 0.05,       // Slider input step value

  frustum: {
    default: 0.3,
    hoveredNoTexture: 0.6,
    withTexture: 0.9,
  },

  light: {
    ambient: 0.5,
    directional: 0.5,
  },
} as const;

export const LINE_WIDTH = {
  default: 1.5,
  hovered: 2.5,
  match: 1,
} as const;
