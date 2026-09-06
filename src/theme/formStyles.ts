/** Shared text, select, range, checkbox, and color controls. */
const FIELD_SURFACE = 'bg-ds-input text-ds-primary border border-ds rounded focus-ds';

export const inputStyles = {
  // Base input styles
  base: `${FIELD_SURFACE} transition-colors`,

  // Size variants
  sizes: {
    sm: 'px-2 py-1 text-sm',
    md: 'px-2 py-1.5 text-sm',
    lg: 'px-3 py-2 text-sm',
  },

  // Select specific
  select: `${FIELD_SURFACE} cursor-pointer px-2 py-1`,

  // Panel selects share the same field surface; layout controls density.
  selectPanel: `${FIELD_SURFACE} cursor-pointer px-2 py-1`,

  // Select sizes (use with select or selectPanel)
  selectSizes: {
    xs: 'px-2 py-0.5 text-xs',
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-1.5 text-sm',
  },

  numeric: `${FIELD_SURFACE} text-sm font-mono px-1 py-0.5`,

  // Checkbox/Radio
  checkbox: 'w-5 h-5 accent-ds-accent cursor-pointer',

  // Range slider
  range: {
    base: 'accent-ds-accent cursor-pointer',
    sm: 'w-20',   // 5rem
    md: 'w-28',   // 7rem
    lg: 'w-36',   // 9rem
    full: 'w-full',
  },

  // States
  disabled: 'opacity-50 cursor-not-allowed',
  error: 'border-ds-error',
} as const;

export const colorPickerStyles = {
  swatch: 'color-swatch relative w-8 h-6 rounded overflow-hidden border border-ds hover-border-ds-light transition-colors cursor-pointer block flex-shrink-0',
  readout: 'text-ds-secondary text-sm font-mono cursor-pointer hover-ds-text-primary transition-colors',
  hueGradient: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
  hueSlider: 'hue-slider w-full cursor-pointer relative z-10',
} as const;
