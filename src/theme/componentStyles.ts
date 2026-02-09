/**
 * Reusable component style objects following ViewerControls pattern.
 * Use these to maintain consistency across similar components.
 */

import { STATUS_COLORS, STATUS_BG } from './colors';


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
    toggle: 'px-4 py-1 text-sm gap-1.5', // Wide toggle button (matches hover panel style)
    toggleResponsive: 'px-4 py-1 text-xs gap-1', // Compact toggle button for modals
    action: 'px-4 py-1.5 text-sm gap-2 min-w-[120px]', // Equal-width action buttons (startup panel)
    icon: 'p-1',         // Square icon button small
    iconMd: 'p-1.5',     // Square icon button medium
    iconLg: 'p-2',       // Square icon button large
    iconXl: 'w-10 h-10', // Large square icon button (viewer controls)
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
    toggleError: 'bg-ds-error/20 text-ds-error border border-ds-error',
    toggleSuccess: 'bg-ds-success/20 text-ds-success border border-ds-success',

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
// SHARED ACTION BUTTON STYLES
// ============================================
// Single source of truth for action buttons used across modals, panels, and context menus

export const actionButtonStyles = {
  // Container for action button groups
  group: 'flex gap-2 mt-3',

  // Standard action buttons (equal width distribution, compact padding)
  button: `${buttonStyles.base} px-1 py-1 text-sm ${buttonStyles.variants.toggle} flex-1`,
  buttonDisabled: `${buttonStyles.base} px-1 py-1 text-sm ${buttonStyles.disabled} bg-ds-secondary text-ds-muted flex-1`,
  buttonPrimary: `${buttonStyles.base} px-1 py-1 text-sm ${buttonStyles.variants.toggleActive} flex-1`,
  buttonPrimaryDisabled: `${buttonStyles.base} px-1 py-1 text-sm ${buttonStyles.disabled} bg-ds-secondary text-ds-muted flex-1`,

  // Full-width primary action button (for "Done", "Confirm" dialogs)
  buttonFullWidth: 'w-full px-3 py-1.5 bg-ds-accent text-ds-void rounded text-sm hover:opacity-90 transition-opacity',

  // Icon action buttons (for confirm/retry/cancel style buttons)
  iconButton: 'p-0.5 transition-colors flex items-center',
  iconButtonConfirm: `p-0.5 ${STATUS_COLORS.success} hover:text-green-300 transition-colors flex items-center`,
  iconButtonRetry: 'p-0.5 text-yellow-400 hover:text-yellow-300 transition-colors flex items-center',
  iconButtonCancel: `p-0.5 ${STATUS_COLORS.error} hover:text-red-300 transition-colors flex items-center`,
} as const;

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
  select: 'bg-ds-input text-ds-primary border border-ds-subtle rounded focus-ds cursor-pointer px-2 py-1',

  // Select without border (for use in panels/hover menus)
  selectPanel: 'bg-ds-input text-ds-primary rounded focus-ds cursor-pointer px-2 py-1',

  // Select sizes (use with select or selectPanel)
  selectSizes: {
    xs: 'px-2 py-0.5 text-xs',
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-1.5 text-sm',
  },

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
  item: 'bg-ds-tertiary rounded cursor-pointer relative border-2 transition-all',
  itemSelected: 'border-ds-accent bg-ds-hover',
  itemHover: 'border-transparent hover-border-ds-light hover-brightness-110',
  itemAspect: 'aspect-square',
  itemInner: 'absolute inset-0 overflow-hidden rounded-sm', // Inner wrapper to clip image without clipping tooltip
  itemImage: 'absolute inset-0 w-full h-full object-cover',
  itemInfoButton: 'z-10 w-6 h-6 rounded text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all',
  overlay: 'absolute bottom-0 left-0 right-0 px-1.5 py-1.5',
  overlayText: 'text-white text-sm truncate',
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
  thumbnailSize: 'w-14 h-14',
  thumbnailPlaceholder: 'w-full h-full flex items-center justify-center text-ds-muted text-xs',
  content: 'flex-1 min-w-0 overflow-hidden',
  title: 'text-ds-primary text-sm truncate font-medium whitespace-nowrap',
  subtitle: 'text-ds-muted text-xs truncate whitespace-nowrap',
} as const;

// ============================================
// MODAL STYLES
// ============================================

export const modalStyles = {
  container: 'absolute inset-0 z-modal pointer-events-none',
  backdrop: 'absolute inset-0 bg-ds-void/50 pointer-events-auto',
  panel: 'absolute bg-ds-tertiary rounded-lg shadow-ds-lg flex flex-col pointer-events-auto',
  header: 'flex items-center justify-between px-4 py-2 border-b border-ds cursor-move select-none',
  headerTitle: 'text-ds-primary text-base font-medium truncate',
  // Tool modal panel (includes responsive class)
  toolPanel: 'absolute bg-ds-tertiary rounded-lg shadow-ds-lg flex flex-col pointer-events-auto tool-modal-responsive',
  // Tool modal header (rounded top with secondary background)
  toolHeader: 'flex items-center justify-between px-4 py-2 rounded-t-lg bg-ds-secondary cursor-move select-none',
  toolHeaderTitle: 'text-ds-primary text-sm font-medium',
  toolHeaderClose: 'w-6 h-6 flex items-center justify-center rounded cursor-pointer text-ds-muted hover:text-ds-primary hover:bg-ds-tertiary transition-colors tool-header-close',
  /** Base for modal header icon buttons (delete/restore actions) */
  headerIconButton: 'w-6 h-6 flex items-center justify-center rounded cursor-pointer transition-colors',
  /** Standard tool modal content area */
  toolContent: 'px-4 py-3 space-y-3',
  closeButton: buttonStyles.closeLg,
  // Reference shared action button styles
  actionGroup: actionButtonStyles.group,
  iconButtonConfirm: actionButtonStyles.iconButtonConfirm,
  iconButtonRetry: actionButtonStyles.iconButtonRetry,
  iconButtonCancel: actionButtonStyles.iconButtonCancel,
  actionButtonPrimary: actionButtonStyles.buttonFullWidth,
} as const;

// ============================================
// TABLE STYLES
// ============================================

export const tableStyles = {
  table: 'w-full text-base',
  header: 'bg-ds-tertiary sticky top-0',
  headerCell: 'text-left px-3 py-0.5 text-ds-secondary',
  row: 'hover-ds-tertiary-50',
  cell: 'px-3 py-0.5 text-ds-primary',
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
  containerWithLayout: 'absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-ds-tertiary rounded-lg shadow-ds-lg max-w-md flex items-start gap-3',
  error: 'border border-ds-error',
  success: 'border border-ds-success',
  content: 'px-6 py-3 text-ds-primary',
  title: 'font-semibold mb-1',
  titleError: 'font-semibold mb-1 text-ds-error',
  message: 'text-base text-ds-secondary',
} as const;

// ============================================
// NOTIFICATION STYLES
// ============================================

export const notificationStyles = {
  // Container - fixed top-center, stacks vertically
  container: 'fixed top-4 left-1/2 -translate-x-1/2 z-toast flex flex-col gap-3 pointer-events-none items-center',

  // Individual notification toast
  toast: 'pointer-events-auto bg-ds-tertiary/90 rounded-lg shadow-ds-lg min-w-[300px] max-w-[400px] flex items-stretch',

  // Icon container (left side) - same style as close button
  iconContainer: 'flex-shrink-0 px-3 flex items-center rounded-l-lg',
  iconContainerInfo: 'text-ds-info',
  iconContainerWarning: 'text-ds-warning',

  // Icon
  icon: 'w-5 h-5',

  // Message content area
  content: 'flex items-center py-4 px-4 flex-1',

  // Message text
  message: 'text-sm text-ds-primary break-words',

  // Close button area (right side)
  closeButton: 'flex-shrink-0 px-3 flex items-center text-ds-muted hover-ds-text-primary hover-ds-hover cursor-pointer transition-colors rounded-r-lg',

  // Animation classes
  entering: 'animate-slide-in-right',
  exiting: 'animate-fade-out',
} as const;

// ============================================
// LOADING STYLES
// ============================================

export const loadingStyles = {
  overlay: 'absolute inset-0 bg-black/50 backdrop-blur-sm z-[500] flex items-center justify-center',
  container: 'text-center',
  dots: 'flex justify-center mb-4 space-x-2',
  dot: 'w-3 h-3 rounded-full bg-white animate-bounce',
  progressBar: 'w-64 h-2 bg-ds-tertiary rounded-full overflow-hidden',
  progressFill: 'h-full bg-white transition-all duration-300',
  text: 'text-xl mb-4 text-white',
  percentage: 'text-base text-white mt-2',
} as const;

// ============================================
// CONTROL PANEL STYLES (Viewer Controls)
// ============================================

export const controlPanelStyles = {
  // Container positioning - z-index tooltip ensures hover panels appear above tool modals
  // Note: idle-hideable is added conditionally by ViewerControls based on autoHideElements.buttons
  container: 'absolute top-3 right-3 flex flex-col gap-2 z-tooltip control-panel-responsive',
  // Button styles
  button: 'w-10 h-10 rounded-lg flex items-center justify-center transition-colors relative border border-ds control-button-responsive',
  buttonActive: 'bg-ds-accent text-ds-void border-ds-accent',
  buttonHover: 'bg-ds-hover text-ds-primary',
  buttonInactive: 'bg-ds-tertiary text-ds-secondary hover-ds-hover hover-ds-text-primary',
  // Panel positioning - right-full positions at container's left edge, pr-2 creates gap inside hover area
  // z-index tooltip ensures hover panels always appear above tool modals (which start at 1000 and increment)
  panelWrapper: 'absolute right-full top-0 pr-2 z-tooltip',
  // Panel content
  panel: 'bg-ds-tertiary border border-ds rounded-lg p-4 w-[240px] shadow-ds-lg hover-panel-responsive',
  panelTitle: 'text-ds-primary text-sm font-medium mb-3',
  panelContent: 'space-y-2',
  // Row layout
  row: 'flex items-center gap-2',
  label: 'text-ds-secondary text-sm whitespace-nowrap w-24 flex-shrink-0',
  value: 'text-ds-primary text-sm w-8 text-right flex-shrink-0 cursor-pointer hover-ds-accent box-border',
  valueInput: 'bg-transparent text-ds-primary text-sm w-8 text-right flex-shrink-0 border-none p-0 m-0 focus:outline-none box-border',
  slider: `${inputStyles.range.base} flex-1 min-w-0`,
  select: `${inputStyles.selectPanel} py-0.5 pl-2 ml-1.5 text-sm flex-1`,
  selectRight: `${inputStyles.selectPanel} py-0.5 pl-2 pr-6 text-sm flex-1 min-w-0 w-full`,  // Same width as slider track
  // Hint text (keyboard shortcuts, etc.)
  hint: 'text-ds-secondary text-sm mt-3',
  hintTitle: 'mb-1 font-medium',
  // Preset buttons (e.g., Transform presets) - uses toggle button design
  presetGroup: 'flex flex-col gap-2 mt-3',
  presetButton: `${buttonStyles.base} ${buttonStyles.sizes.toggle} ${buttonStyles.variants.toggle} w-full justify-start`,
  // Action buttons (e.g., Reset, Apply) - references shared action button styles
  actionGroup: actionButtonStyles.group,
  actionButton: actionButtonStyles.button,
  actionButtonDisabled: actionButtonStyles.buttonDisabled,
  actionButtonPrimary: actionButtonStyles.buttonPrimary,
  actionButtonPrimaryDisabled: actionButtonStyles.buttonPrimaryDisabled,
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
// TOGGLE SWITCH STYLES (Single source of truth)
// ============================================

/**
 * Toggle switch (oval with circle) - replaces checkboxes
 * Usage: <ToggleSwitch checked={value} onChange={setValue} />
 */
export const toggleSwitchStyles = {
  // Outer track (oval container)
  track: 'relative inline-flex items-center cursor-pointer transition-colors duration-200 rounded-full',
  trackSm: 'w-7 h-4',   // Small: 28x16px
  trackMd: 'w-9 h-5',   // Medium: 36x20px (default)
  trackLg: 'w-11 h-6',  // Large: 44x24px

  // Track colors
  trackOff: 'bg-ds-secondary border border-ds-light',
  trackOn: 'bg-ds-accent border border-ds-accent',

  // Inner circle (thumb) - base styles only, position via inline style
  thumb: 'absolute bg-white rounded-full shadow-sm transition-all duration-200 ease-in-out',
  thumbSm: 'w-2.5 h-2.5',   // 10x10px
  thumbMd: 'w-3.5 h-3.5',   // 14x14px
  thumbLg: 'w-4.5 h-4.5',   // 18x18px

  // States
  disabled: 'opacity-50 cursor-not-allowed',

  // Container with label
  container: 'flex items-center gap-2',
  label: 'text-ds-secondary text-sm whitespace-nowrap cursor-pointer',
} as const;

// Thumb positions in pixels for each size
const THUMB_POSITIONS = {
  sm: { off: 3, on: 14 },   // 28px track, 10px thumb
  md: { off: 3, on: 18 },   // 36px track, 14px thumb
  lg: { off: 3, on: 22 },   // 44px track, 18px thumb
} as const;

// Helper to get toggle switch classes and thumb position
export function getToggleSwitchClasses(
  checked: boolean,
  size: 'sm' | 'md' | 'lg' = 'md',
  disabled = false
): { track: string; thumb: string; thumbStyle: React.CSSProperties } {
  const sizeClasses = {
    sm: { track: toggleSwitchStyles.trackSm, thumb: toggleSwitchStyles.thumbSm },
    md: { track: toggleSwitchStyles.trackMd, thumb: toggleSwitchStyles.thumbMd },
    lg: { track: toggleSwitchStyles.trackLg, thumb: toggleSwitchStyles.thumbLg },
  };

  const s = sizeClasses[size];
  const pos = THUMB_POSITIONS[size];
  const trackColor = checked ? toggleSwitchStyles.trackOn : toggleSwitchStyles.trackOff;

  return {
    track: `${toggleSwitchStyles.track} ${s.track} ${trackColor}${disabled ? ` ${toggleSwitchStyles.disabled}` : ''}`,
    thumb: `${toggleSwitchStyles.thumb} ${s.thumb}`,
    thumbStyle: {
      left: checked ? pos.on : pos.off,
      top: '50%',
      transform: 'translateY(-50%)',
    },
  };
}

// ============================================
// CHECKBOX GROUP STYLES (Legacy - use ToggleSwitch instead)
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
  // Note: idle-hideable is added conditionally by FooterBranding based on autoHideElements.buttons
  logo: 'absolute bottom-6 left-6 footer-logo-responsive',
  logoImage: 'opacity-70 hover-opacity-100 transition-opacity',
  socialContainer: 'absolute bottom-6 right-6 flex items-center gap-4 footer-social-responsive',
  socialLink: 'text-ds-secondary opacity-70 hover-opacity-100 transition-opacity',
} as const;

// ============================================
// CONTEXT MENU STYLES
// ============================================

export const contextMenuStyles = {
  container: 'bg-ds-tertiary rounded-lg shadow-ds-lg overflow-hidden border border-ds py-1',
  button: 'flex items-center gap-2 px-3 py-1.5 text-sm text-ds-primary hover-ds-hover cursor-pointer transition-colors w-full text-left',
  icon: 'w-4 h-4 flex-shrink-0',
  hotkey: 'text-xs font-mono text-gray-500 ml-auto uppercase tracking-wide',
} as const;

// ============================================
// TOOLBAR STYLES
// ============================================

export const toolbarStyles = {
  container: 'h-10 border-b border-ds flex items-center px-4 bg-ds-tertiary',
  group: 'flex items-center gap-2',
} as const;

// ============================================
// STATUS BAR STYLES
// ============================================

export const statusBarStyles = {
  container: 'h-10 border-t border-ds bg-ds-tertiary text-ds-secondary text-base px-4 flex items-center justify-between status-bar-responsive overflow-visible',
  group: 'flex items-center gap-6 status-bar-group overflow-visible',
} as const;

// ============================================
// EMPTY STATE STYLES
// ============================================

export const emptyStateStyles = {
  container: 'h-full flex items-center justify-center text-ds-muted bg-ds-secondary',
  containerFull: 'flex flex-col items-center justify-center h-full p-8 text-center bg-ds-secondary',
  icon: 'text-ds-error text-6xl mb-4',
  title: 'text-xl font-semibold text-ds-primary mb-2',
  message: 'text-ds-secondary mb-4 max-w-md',
  button: 'px-4 py-2 bg-ds-accent text-ds-void rounded hover-bg-ds-accent-90 transition-colors',
} as const;

// ============================================
// MOBILE MESSAGE STYLES
// ============================================

export const mobileMessageStyles = {
  container: 'h-screen flex flex-col items-center justify-center bg-ds-primary p-6 text-center',
  title: 'text-2xl font-semibold text-ds-primary mb-3',
  message: 'text-ds-secondary mb-4',
  badge: 'mt-6 px-4 py-2 bg-ds-tertiary rounded-lg text-sm text-ds-muted',
} as const;

// ============================================
// RESIZE HANDLE STYLES (for modals)
// ============================================

export const resizeHandleStyles = {
  corner: 'absolute w-3 h-3',
  edge: 'absolute',
  nw: 'top-0 left-0 cursor-nw-resize',
  ne: 'top-0 right-0 cursor-ne-resize',
  sw: 'bottom-0 left-0 cursor-sw-resize',
  se: 'bottom-0 right-0 cursor-se-resize',
  n: 'top-0 left-3 right-3 h-2 cursor-n-resize',
  s: 'bottom-0 left-3 right-3 h-2 cursor-s-resize',
  w: 'left-0 top-3 bottom-3 w-2 cursor-w-resize',
  e: 'right-0 top-3 bottom-3 w-2 cursor-e-resize',
} as const;

// ============================================
// HISTOGRAM TOOLTIP STYLES (for StatusBar stats)
// ============================================

export const histogramStyles = {
  // Container positions above the stat, centered (transform handled inline for viewport clamping)
  container: 'absolute left-1/2 z-tooltip',
  // Inline style needed for positioning above: style={{ bottom: '100%', marginBottom: '8px' }}
  // Card styling
  card: 'bg-ds-tertiary rounded-lg px-4 py-3 shadow-ds-lg text-sm border border-ds',
  // Title text
  title: 'text-ds-primary text-sm font-medium mb-1',
  // Row for each histogram bin
  row: 'flex items-center gap-2 h-5',
  // Label (left side, right-aligned)
  label: 'w-12 text-right text-ds-secondary text-xs',
  // Bar background
  barBg: 'flex-1 bg-ds-secondary/20 rounded-sm h-3 overflow-hidden',
  // Bar fill (actual histogram bar)
  barFill: 'h-full bg-ds-accent rounded-sm transition-all',
  // Count text (right side)
  count: 'w-16 text-ds-muted text-xs',
  // Footer with mean and total
  footer: 'text-ds-secondary text-xs mt-3 pt-2 border-t border-ds',
} as const;

// ============================================
// TOUCH MODE STYLES
// ============================================

/**
 * Touch-specific UI styles for tablets and touch devices.
 * Used when touchMode is active.
 */
export const touchStyles = {
  // FAB (Floating Action Button)
  fab: 'fixed rounded-full shadow-lg flex items-center justify-center transition-all duration-200 active:scale-95',
  fabPrimary: 'bg-ds-accent text-ds-void hover:bg-ds-accent/90',
  fabSecondary: 'bg-ds-tertiary text-ds-primary border border-ds hover:bg-ds-hover',

  // Bottom sheet
  bottomSheet: 'fixed inset-x-0 bottom-0 bg-ds-tertiary rounded-t-2xl shadow-ds-lg z-[996]',
  bottomSheetHandle: 'w-12 h-1 bg-ds-secondary rounded-full mx-auto my-3',
  bottomSheetContent: 'max-h-[80vh] overflow-y-auto overscroll-contain px-4 pb-6',
  bottomSheetSection: 'py-3 border-b border-ds last:border-0',
  bottomSheetSectionTitle: 'text-ds-muted text-xs uppercase tracking-wide mb-2',

  // Drawer (slide-out panel)
  drawer: 'fixed inset-y-0 right-0 bg-ds-secondary shadow-ds-lg z-[998]',
  drawerBackdrop: 'fixed inset-0 bg-ds-void/50 backdrop-blur-sm z-[997]',
  drawerHeader: 'h-12 flex items-center justify-between px-4 border-b border-ds bg-ds-tertiary',
  drawerTitle: 'text-ds-primary text-base font-medium',

  // Touch rows (for control panels)
  touchRow: 'min-h-[48px] flex items-center gap-3 px-4 active:bg-ds-hover',
  touchRowLabel: 'flex-1 text-ds-primary text-sm',
  touchRowValue: 'text-ds-secondary text-sm',

  // Touch buttons (larger tap targets)
  touchButton: 'min-h-[44px] px-4 flex items-center justify-center gap-2 rounded-lg',

  // Selection toast (brief feedback)
  selectionToast: 'fixed top-4 left-1/2 -translate-x-1/2 bg-ds-tertiary/95 px-4 py-2 rounded-lg shadow-ds z-fab',
  selectionToastText: 'text-ds-primary text-sm whitespace-nowrap',

  // Touch status bar
  touchStatusBar: 'h-6 border-t border-ds bg-ds-tertiary text-ds-secondary text-xs px-3 flex items-center justify-between',
} as const;

// ============================================
// COLOR PICKER STYLES
// ============================================

export const colorPickerStyles = {
  hueGradient: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
  hueSlider: 'w-full h-4 cursor-pointer appearance-none bg-transparent relative z-10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-gray-400 [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-gray-400 [&::-moz-range-thumb]:cursor-pointer [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent',
} as const;

// ============================================
// CACHE STATS INDICATOR STYLES
// ============================================

export const cacheStatsStyles = {
  // Wrapper for the indicator in status bar
  wrapper: 'relative cursor-help overflow-visible',
  // Indicator text in status bar
  indicator: 'inline-flex items-center gap-1',
  indicatorLabel: 'text-ds-secondary',
  indicatorValue: 'text-ds-primary',
  // Tooltip container (uses histogramStyles.container positioning)
  tooltipContainer: 'absolute z-tooltip',
  // Tooltip card - wider, no wrapping
  card: 'bg-ds-tertiary rounded-lg px-4 py-3 shadow-ds-lg text-sm border border-ds whitespace-nowrap',
  // Header row with title and legend
  header: 'flex items-center justify-between gap-8 mb-2',
  headerTitle: 'flex items-center gap-1.5 text-ds-primary text-sm font-medium whitespace-nowrap',
  headerLegend: 'flex items-center gap-4 text-[10px]',
  legendItem: 'flex items-center gap-1',
  legendText: 'text-ds-muted',
  // Status dots
  dotMemoryJs: `inline-block w-1.5 h-1.5 rounded-full ${STATUS_BG.success} flex-shrink-0`,
  dotMemoryWasm: 'inline-block w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0',
  dotLazy: `inline-block w-1.5 h-1.5 rounded-full ${STATUS_BG.info} flex-shrink-0`,
  dotUnavailable: `inline-block w-1.5 h-1.5 rounded-full ${STATUS_BG.inactive} flex-shrink-0`,
  // Table styles
  table: 'w-full text-xs',
  tableHeader: 'text-[10px] text-ds-muted border-b border-ds',
  tableHeaderCell: 'py-1 font-normal whitespace-nowrap',
  tableHeaderLeft: 'text-left',
  tableHeaderRight: 'text-right',
  // Table row
  tableRow: 'py-0.5',
  tableRowDimmed: 'opacity-40',
  tableCellLabel: 'pr-6 whitespace-nowrap',
  tableCellLabelInner: 'flex items-center gap-2',
  tableCellLabelText: 'text-ds-secondary whitespace-nowrap',
  tableCellCount: 'px-4 text-right tabular-nums text-ds-primary whitespace-nowrap',
  tableCellSize: 'pl-4 text-right tabular-nums text-ds-muted whitespace-nowrap w-20',
  // Footer row
  tableFooter: 'border-t border-ds font-medium',
  tableFooterCell: 'pt-1.5',
  tableFooterLabel: 'text-ds-secondary',
  tableFooterValue: 'text-ds-primary',
} as const;
