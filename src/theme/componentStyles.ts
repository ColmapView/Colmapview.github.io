/**
 * Reusable component style objects following ViewerControls pattern.
 * Use these to maintain consistency across similar components.
 */

import { STATUS_BG } from './colors';
import { inputStyles } from './formStyles';
export { inputStyles, colorPickerStyles } from './formStyles';
export { tabStyles, toggleSwitchStyles, getToggleSwitchClasses, checkboxGroupStyles } from './selectionStyles';
export { loadingStyles, emptyStateStyles, mobileMessageStyles, errorStateStyles } from './feedbackStyles';
import { buttonStyles, actionButtonStyles } from './buttonStyles';
export { buttonStyles, actionButtonStyles, getButtonClass } from './buttonStyles';
import { floatingPanelStyles, panelStyles } from './panelStyles';
export { floatingPanelStyles, panelStyles } from './panelStyles';


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

// Compatibility recipes compose the canonical panel system.
export const modalStyles = {
  container: 'absolute inset-0 z-modal pointer-events-none',
  backdrop: 'absolute inset-0 bg-ds-void/50 pointer-events-auto',
  panel: `absolute ${floatingPanelStyles.dialog} pointer-events-auto`,
  compactPanel: `fixed ${panelStyles.surface} ${panelStyles.compactInset}`,
  header: panelStyles.draggableHeader,
  headerTitle: `${panelStyles.title} truncate`,
  // Tool modal panel (includes responsive class)
  toolPanel: `absolute ${floatingPanelStyles.dialog} pointer-events-auto tool-modal-responsive`,
  // popupHeader = static dialogs; toolHeader =
  // draggable tool windows (same header + cursor-move).
  popupHeader: panelStyles.header,
  toolHeader: panelStyles.draggableHeader,
  toolHeaderTitle: panelStyles.title,
  toolHeaderClose: panelStyles.close,
  /** Base for modal header icon buttons (delete/restore actions) */
  headerIconButton: 'w-6 h-6 flex items-center justify-center rounded cursor-pointer transition-colors',
  /** Standard tool modal content area */
  toolContent: panelStyles.toolBody,
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
  container: `${floatingPanelStyles.surface} px-3 py-2 whitespace-nowrap text-sm`,
  title: 'text-ds-primary font-semibold',
  subtitle: 'text-ds-secondary',
  hint: 'text-ds-secondary text-sm mt-2',
  hintRow: 'flex items-center gap-1',
} as const;

// ============================================
// TOAST/ALERT STYLES
// ============================================

export const toastStyles = {
  container: `absolute top-4 left-1/2 -translate-x-1/2 z-overlay ${floatingPanelStyles.surface}`,
  containerWithLayout: `absolute top-4 left-1/2 -translate-x-1/2 z-overlay ${floatingPanelStyles.surface} max-w-md flex items-start gap-3`,
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
  toast: `pointer-events-auto ${floatingPanelStyles.surface} min-w-[300px] max-w-[400px] flex items-stretch`,

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
// CONTROL PANEL STYLES (Viewer Controls)
// ============================================

export const controlPanelStyles = {
  // Container positioning - z-index tooltip keeps hover panels above tool modals.
  // Note: idle-hideable is added conditionally by ViewerControls based on autoHideElements.buttons
  container: 'absolute top-3 right-3 flex flex-col gap-2 z-tooltip control-panel-responsive',
  // Button styles
  button: 'w-10 h-10 rounded-lg flex items-center justify-center transition-colors relative border border-ds control-button-responsive viewer-control',
  buttonActive: 'viewer-control-selected text-ds-primary',
  buttonHover: 'bg-ds-hover text-ds-primary',
  buttonInactive: 'bg-ds-tertiary text-ds-secondary hover-ds-hover hover-ds-text-primary',
  // Panel positioning - right-full positions at container's left edge, pr-2 creates gap inside hover area
  // z-index tooltip keeps hover panels above tool modals, while context menus render above panels.
  panelWrapper: 'absolute right-full top-0 pr-2 z-tooltip',
  // Panel content
  panel: `${panelStyles.surface} ${panelStyles.inset} w-[240px] hover-panel-responsive`,
  panelTitle: `${panelStyles.title} mb-3`,
  panelContent: 'space-y-2',
  // Row layout
  row: 'flex items-center gap-2',
  label: 'text-ds-secondary text-sm whitespace-nowrap w-24 flex-shrink-0',
  value: 'text-ds-primary text-sm w-8 text-right flex-shrink-0 cursor-pointer hover-ds-accent box-border',
  valueInput: 'bg-transparent text-ds-primary text-sm w-8 text-right flex-shrink-0 border-none p-0 m-0 box-border',
  slider: `${inputStyles.range.base} flex-1 min-w-0`,
  select: `${inputStyles.selectPanel} py-0.5 pl-2 ml-1.5 text-sm flex-1`,
  selectRight: `${inputStyles.selectPanel} py-0.5 pl-2 pr-6 text-sm flex-1 min-w-0 w-full`,  // Same width as slider track
  // Hint text (keyboard shortcuts, etc.)
  hint: 'text-ds-secondary text-sm mt-3',
  hintTitle: 'mb-1 font-medium',
  // Preset buttons (e.g. the Align panel's goals) - uses toggle button design.
  // The list gaps wider than the groups inside it: that difference is the only
  // thing telling the reader which caption owns which buttons.
  presetGroupList: 'flex flex-col gap-4 mt-3',
  presetGroup: 'flex flex-col gap-1.5',
  // Caption above a group of controls. Named for the role rather than for the
  // preset list that happens to be its only consumer today: this is the same
  // typography SettingsPanel repeats inline at each of its five section
  // headings, which each append their own margins.
  // Carries no margin of its own: flex `gap` and margin ADD up, so a margin
  // here would push the caption away from the buttons it labels and flatten the
  // list-gap-vs-group-gap difference that does the grouping.
  panelSectionLabel: 'text-ds-muted text-xs uppercase tracking-wide',
  // Labels are CENTERED: buttonStyles.base sets justify-center, and index.css
  // declares .justify-center after .justify-start at equal specificity, so a
  // `justify-start` appended here is inert no matter where it sits in the class
  // attribute. Both tokens carried one until it was found to do nothing; don't
  // re-add it. Left-aligning would mean pulling justify-center out of base
  // (every button in the app) or reordering index.css — not worth it, and
  // centered reads fine in the panel.
  presetButton: actionButtonStyles.preset,
  // Disabled preset: preset geometry, shared disabled surface — so this family
  // and the action row can be retuned independently.
  presetButtonDisabled: actionButtonStyles.presetDisabled,
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
  logo: 'absolute left-6 footer-logo-responsive',
  logoImage: 'opacity-70 hover-opacity-100 transition-opacity',
  socialContainer: 'absolute right-6 flex items-center gap-4 footer-social-responsive',
  socialLink: 'text-ds-secondary opacity-70 hover-opacity-100 transition-opacity',
} as const;

// ============================================
// CONTEXT MENU STYLES
// ============================================

export const contextMenuStyles = {
  container: `${floatingPanelStyles.surface} overflow-hidden py-1`,
  button: 'flex items-center gap-2 px-3 py-1.5 text-sm text-ds-primary hover-ds-hover cursor-pointer transition-colors w-full text-left',
  icon: 'w-4 h-4 flex-shrink-0',
  hotkey: 'text-xs font-mono text-ds-muted ml-auto uppercase tracking-wide',
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
  container: 'absolute inset-x-0 bottom-0 z-sticky h-10 border-t border-ds bg-ds-tertiary text-ds-secondary text-base px-4 flex items-center justify-between status-bar-responsive overflow-visible',
  group: 'flex items-center gap-6 status-bar-group overflow-visible',
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
  card: `${floatingPanelStyles.surface} px-4 py-3 text-sm`,
  // Title text
  title: `${panelStyles.title} mb-1`,
  // Row for each histogram bin
  row: 'flex items-center gap-2 h-5',
  // Label (left side, right-aligned)
  label: 'w-12 text-right text-ds-secondary text-xs',
  // Bar fill (actual histogram bar)
  barFill: 'h-full bg-ds-accent rounded-sm transition-all',
  // Count text (right side)
  count: 'w-16 text-ds-muted text-xs',
  // Footer with mean and total
  footer: 'text-ds-secondary text-xs mt-3 pt-2 border-t border-ds',
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
  card: `${floatingPanelStyles.surface} px-4 py-3 text-sm whitespace-nowrap`,
  // Header row with title and legend
  header: 'flex items-center justify-between gap-8 mb-2',
  headerTitle: `flex items-center gap-1.5 ${panelStyles.title} whitespace-nowrap`,
  headerLegend: 'flex items-center gap-4 text-[10px]',
  legendItem: 'flex items-center gap-1',
  legendText: 'text-ds-muted',
  // Status dots
  dotMemoryJs: `inline-block w-1.5 h-1.5 rounded-full ${STATUS_BG.success} flex-shrink-0`,
  dotMemoryWasm: `inline-block w-1.5 h-1.5 rounded-full ${STATUS_BG.warning} flex-shrink-0`,
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
