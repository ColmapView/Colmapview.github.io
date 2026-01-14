/**
 * Reusable component style objects following ViewerControls pattern.
 * Use these to maintain consistency across similar components.
 */

import { Z_INDEX } from './zIndex';

// ============================================
// BUTTON STYLES
// ============================================

export const buttonStyles = {
  // Base styles for all buttons
  base: 'inline-flex items-center justify-center rounded transition-colors cursor-pointer select-none',

  // Size variants
  sizes: {
    xs: 'px-2 py-1 text-xs gap-1',
    sm: 'px-2.5 py-1.5 text-sm gap-1.5',
    md: 'px-3 py-1.5 text-base gap-2',
    lg: 'px-4 py-2 text-base gap-2',
    xl: 'px-6 py-3 text-lg gap-3',
    icon: 'p-1.5',       // Square icon button small
    iconMd: 'p-2',       // Square icon button medium
    iconLg: 'p-3',       // Square icon button large
    iconXl: 'w-12 h-12', // Large square icon button (viewer controls)
  },

  // Color variants
  variants: {
    // Primary - accent colored, high emphasis
    primary: 'bg-ds-accent text-ds-void hover-bg-ds-accent-90',

    // Secondary - subtle background, medium emphasis
    secondary: 'bg-ds-hover text-ds-primary hover-ds-elevated',

    // Tertiary - darker background
    tertiary: 'bg-ds-tertiary text-ds-primary hover-ds-hover border border-ds',

    // Ghost - no background until hover
    ghost: 'bg-transparent text-ds-secondary hover-ds-text-primary hover-ds-hover',

    // Outline - border only
    outline: 'bg-transparent text-ds-primary border border-ds hover-ds-hover',

    // Danger - for destructive actions
    danger: 'bg-ds-error text-white hover-opacity-90',

    // Tab style - for tab-like buttons
    tab: 'bg-transparent text-ds-secondary hover-ds-text-primary hover-ds-tertiary-50',
    tabActive: 'bg-ds-tertiary text-ds-accent border-b-2 border-ds-accent',

    // Toggle style - for toggle buttons (gallery view mode)
    toggle: 'bg-ds-hover text-ds-secondary hover-ds-text-primary hover-ds-elevated',
    toggleActive: 'bg-ds-accent text-ds-void',

    // Control style - for viewer controls (solid background for visibility on any canvas color)
    control: 'bg-ds-tertiary text-ds-secondary hover-ds-hover hover-ds-text-primary rounded-lg border border-ds',
    controlActive: 'bg-ds-accent text-ds-void rounded-lg border border-ds-accent',
    controlHover: 'bg-ds-hover text-ds-primary rounded-lg border border-ds',
  },

  // States
  disabled: 'opacity-50 cursor-not-allowed pointer-events-none',

  // Close button (X)
  close: 'text-ds-muted hover-ds-text-primary text-xl leading-none cursor-pointer',
  closeLg: 'text-ds-muted hover-ds-text-primary text-2xl leading-none px-2 cursor-pointer',
} as const;

// Helper function to compose button classes
export function getButtonClass(
  variant: keyof typeof buttonStyles.variants = 'secondary',
  size: keyof typeof buttonStyles.sizes = 'md',
  disabled = false
): string {
  const classes: string[] = [
    buttonStyles.base,
    buttonStyles.sizes[size],
    buttonStyles.variants[variant],
  ];
  if (disabled) {
    classes.push(buttonStyles.disabled);
  }
  return classes.join(' ');
}

// ============================================
// FORM INPUT STYLES
// ============================================

export const inputStyles = {
  // Base input styles
  base: 'bg-ds-input text-ds-primary border border-ds rounded focus-ds transition-colors',

  // Size variants
  sizes: {
    sm: 'px-2 py-1 text-sm',
    md: 'px-2 py-1.5 text-base',
    lg: 'px-3 py-2 text-base',
  },

  // Select specific
  select: 'bg-ds-input text-ds-primary border border-ds rounded focus-ds cursor-pointer',

  // Select without border (for use in panels/hover menus)
  selectPanel: 'bg-ds-input text-ds-primary rounded focus-ds cursor-pointer',

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

// ============================================
// GALLERY STYLES
// ============================================

export const galleryStyles = {
  item: 'bg-ds-tertiary rounded cursor-pointer overflow-hidden relative border-2 transition-all',
  itemSelected: 'border-ds-accent bg-ds-hover',
  itemHover: 'border-transparent hover-border-ds-light hover-brightness-110',
  overlay: 'absolute bottom-0 left-0 right-0 px-1.5 py-1.5 bg-gradient-to-t from-ds-void/70 to-transparent',
  placeholder: 'absolute inset-0 flex items-center justify-center text-ds-muted text-xs p-1 text-center',
} as const;

// ============================================
// LIST STYLES
// ============================================

export const listStyles = {
  item: 'flex items-center gap-3 px-2 h-full rounded cursor-pointer border-2 transition-all',
  itemSelected: 'border-ds-accent bg-ds-hover',
  itemHover: 'border-transparent hover-ds-hover hover-border-ds-light',
  thumbnail: 'flex-shrink-0 bg-ds-hover rounded overflow-hidden',
  content: 'flex-1 min-w-0',
  title: 'text-ds-primary text-sm truncate',
  subtitle: 'text-ds-muted text-xs',
} as const;

// ============================================
// MODAL STYLES
// ============================================

export const modalStyles = {
  container: `absolute inset-0 z-[${Z_INDEX.modal}] pointer-events-none`,
  backdrop: 'absolute inset-0 bg-ds-void/50 pointer-events-auto',
  panel: 'absolute bg-ds-tertiary rounded-lg shadow-ds-lg flex flex-col pointer-events-auto',
  header: 'flex items-center justify-between px-4 py-2 border-b border-ds cursor-move select-none',
  headerTitle: 'text-ds-primary text-base font-medium truncate',
  closeButton: buttonStyles.closeLg,
} as const;

// ============================================
// PANEL STYLES
// ============================================

export const panelStyles = {
  container: 'bg-ds-tertiary border border-ds rounded-lg shadow-ds-lg',
  header: 'px-4 py-2 border-b border-ds',
  title: 'text-ds-primary text-base font-medium',
  content: 'p-4',
  row: 'flex items-center justify-between gap-2',
  label: 'text-ds-secondary text-base whitespace-nowrap',
  value: 'text-ds-primary text-base text-right',
} as const;

// ============================================
// TABLE STYLES
// ============================================

export const tableStyles = {
  table: 'w-full text-base',
  header: 'bg-ds-tertiary sticky top-0',
  headerCell: 'text-left px-3 py-2 text-ds-secondary',
  row: 'border-b border-ds-subtle hover-ds-tertiary-50',
  cell: 'px-3 py-2 text-ds-primary',
  cellTruncate: 'truncate max-w-[200px]',
} as const;

// ============================================
// TAB STYLES
// ============================================

export const tabStyles = {
  container: 'flex border-b border-ds',
  tab: `px-4 py-2 text-base font-medium transition-colors ${buttonStyles.variants.tab}`,
  tabActive: `px-4 py-2 text-base font-medium ${buttonStyles.variants.tabActive}`,
} as const;

// ============================================
// TOOLTIP STYLES
// ============================================

/**
 * Tooltip system using data attributes.
 * Usage: <element data-tooltip="Tooltip text" data-tooltip-pos="left">
 *
 * The actual CSS is in index.css using ::after pseudo-elements.
 * This object defines the data attribute names and position values.
 */
export const tooltipStyles = {
  // Data attribute names
  attr: 'data-tooltip',
  posAttr: 'data-tooltip-pos',

  // Position values
  positions: {
    top: undefined,      // Default position (no attribute needed)
    bottom: 'bottom',
    left: 'left',
    right: 'right',
  },
} as const;

// Helper to create tooltip props
export function getTooltipProps(
  text: string,
  position?: keyof typeof tooltipStyles.positions
): Record<string, string> {
  const props: Record<string, string> = {
    [tooltipStyles.attr]: text,
  };
  if (position && tooltipStyles.positions[position]) {
    props[tooltipStyles.posAttr] = tooltipStyles.positions[position]!;
  }
  return props;
}

// ============================================
// HOVER CARD STYLES
// ============================================

/**
 * Hover card styles for floating info panels (e.g., frustum hover tooltip).
 * Use these for consistent hover popups across the app.
 */
export const hoverCardStyles = {
  container: 'bg-ds-tertiary rounded-lg px-3 py-2 shadow-ds-lg whitespace-nowrap text-sm',
  title: 'text-ds-primary',
  subtitle: 'text-ds-secondary',
  hint: 'text-ds-secondary text-sm mt-2',
  hintRow: 'flex items-center gap-1',
} as const;

// ============================================
// TOAST/ALERT STYLES
// ============================================

export const toastStyles = {
  container: 'absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-ds-tertiary rounded-lg shadow-ds-lg',
  error: 'border border-ds-error',
  success: 'border border-ds-success',
  content: 'px-6 py-3 text-ds-primary',
  title: 'font-semibold mb-1',
  message: 'text-base text-ds-secondary',
} as const;

// ============================================
// LOADING STYLES
// ============================================

export const loadingStyles = {
  overlay: 'absolute inset-0 bg-ds-void/80 z-[500] flex items-center justify-center',
  container: 'text-center',
  dots: 'flex justify-center mb-4 space-x-2',
  dot: 'w-3 h-3 rounded-full bg-ds-accent animate-bounce',
  progressBar: 'w-64 h-2 bg-ds-tertiary rounded-full overflow-hidden',
  progressFill: 'h-full bg-ds-accent transition-all duration-300',
  text: 'text-xl mb-4 text-ds-primary',
  percentage: 'text-base text-ds-secondary mt-2',
} as const;

// ============================================
// CONTROL PANEL STYLES (Viewer Controls)
// ============================================

export const controlPanelStyles = {
  // Container positioning
  container: 'absolute top-3 right-3 flex flex-col gap-2 z-10',
  // Button styles
  button: 'w-12 h-12 rounded-lg flex items-center justify-center transition-colors relative border border-ds',
  buttonActive: 'bg-ds-accent text-ds-void border-ds-accent',
  buttonHover: 'bg-ds-hover text-ds-primary',
  buttonInactive: 'bg-ds-tertiary text-ds-secondary hover-ds-hover hover-ds-text-primary',
  // Panel positioning
  panelWrapper: 'absolute right-[56px] top-0',
  panelBridge: 'absolute right-12 top-0 w-2 h-12',
  // Panel content
  panel: 'bg-ds-tertiary border border-ds rounded-lg p-4 w-[240px] shadow-ds-lg',
  panelTitle: 'text-ds-primary text-base font-medium mb-3',
  panelContent: 'space-y-2',
  // Row layout
  row: 'flex items-center gap-2',
  label: 'text-ds-secondary text-base whitespace-nowrap w-20 flex-shrink-0',
  value: 'text-ds-primary text-base w-8 text-right flex-shrink-0',
  slider: `${inputStyles.range.base} flex-1 min-w-0`,
  select: `${inputStyles.selectPanel} py-1.5 text-base flex-1`,
  // Hint text (keyboard shortcuts, etc.)
  hint: 'text-ds-secondary text-sm mt-3',
  hintTitle: 'mb-1 font-medium',
} as const;

// Helper to get control button class
export function getControlButtonClass(isActive: boolean, isHovered: boolean): string {
  if (isActive) return `${controlPanelStyles.button} ${controlPanelStyles.buttonActive}`;
  if (isHovered) return `${controlPanelStyles.button} ${controlPanelStyles.buttonHover}`;
  return `${controlPanelStyles.button} ${controlPanelStyles.buttonInactive}`;
}

// ============================================
// CARD STYLES
// ============================================

export const cardStyles = {
  container: 'bg-ds-tertiary rounded p-3',
  label: 'text-ds-secondary text-base',
  value: 'text-ds-primary text-lg font-semibold',
} as const;

// ============================================
// SEPARATOR STYLES
// ============================================

export const separatorStyles = {
  vertical: 'w-1 bg-ds-tertiary hover-bg-ds-accent transition-colors cursor-col-resize',
  horizontal: 'h-1 bg-ds-tertiary hover-bg-ds-accent transition-colors cursor-row-resize',
} as const;

// ============================================
// CHECKBOX GROUP STYLES
// ============================================

export const checkboxGroupStyles = {
  container: 'flex items-center gap-2',
  checkbox: 'w-5 h-5 cursor-pointer',
  label: 'text-ds-primary text-base',
} as const;

// ============================================
// DRAG OVERLAY STYLES
// ============================================

export const dragOverlayStyles = {
  container: 'absolute inset-0 bg-ds-accent/10 border-4 border-dashed border-ds-accent z-overlay flex items-center justify-center backdrop-blur-sm',
  content: 'text-center',
  icon: 'text-4xl mb-4',
  title: 'text-xl font-semibold text-ds-primary',
  subtitle: 'text-base text-ds-secondary mt-2',
} as const;

// ============================================
// FOOTER STYLES
// ============================================

export const footerStyles = {
  logo: 'absolute bottom-6 left-6',
  socialContainer: 'absolute bottom-6 right-6 flex items-center gap-4',
  socialLink: 'text-ds-secondary opacity-70 hover-opacity-100 transition-opacity',
} as const;
