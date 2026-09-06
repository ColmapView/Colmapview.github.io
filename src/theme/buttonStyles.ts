/** Canonical button and action recipes. Import through theme. */
import { STATUS_COLORS } from './colors';

// ============================================
// BUTTON STYLES
// ============================================

const CLOSE_BUTTON = 'dismiss-control cursor-pointer text-ds-muted hover-ds-text-primary hover-ds-hover transition-colors';

export const buttonStyles = {
  // Base styles for all buttons
  base: 'button-ui inline-flex items-center justify-center rounded transition-colors cursor-pointer select-none',

  // Size variants
  sizes: {
    xs: 'px-2 py-1 text-xs gap-1',
    sm: 'px-2.5 py-1.5 text-sm gap-1.5',
    md: 'px-3 py-1.5 text-base gap-2',
    lg: 'button-standard px-4 py-2 text-sm gap-2',
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
    controlActive: 'viewer-control-selected text-ds-primary rounded-lg border',
    controlHover: 'bg-ds-hover text-ds-primary rounded-lg border border-ds',
  },

  // States
  disabled: 'opacity-50 cursor-not-allowed pointer-events-none',
  // The colors a disabled button wears — the `variants` entry the disabled
  // state never had. Split from `disabled` above, which is behavior and opacity
  // only, because a greyed-out button needs both and every family was pairing
  // them by hand. The tokens below compose it; a few view-models outside this
  // file still spell the pair out inline.
  disabledSurface: 'bg-ds-secondary text-ds-muted',

  // Close button (X)
  close: CLOSE_BUTTON,
  closeLg: CLOSE_BUTTON,
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

const PANEL_ACTION = `${buttonStyles.base} button-standard px-2 py-2 text-sm gap-2 flex-1`;
const PANEL_SECONDARY_ACTION = `${PANEL_ACTION} ${buttonStyles.variants.secondary}`;
const PANEL_PRIMARY_ACTION = `${PANEL_ACTION} ${buttonStyles.variants.primary}`;

export const actionButtonStyles = {
  // Container for action button groups
  group: 'flex gap-2 mt-3',

  // Standard action geometry, including disabled panel actions.
  button: PANEL_SECONDARY_ACTION,
  buttonDisabled: `${PANEL_SECONDARY_ACTION} ${buttonStyles.disabled}`,
  buttonPrimary: PANEL_PRIMARY_ACTION,
  buttonPrimaryDisabled: `${PANEL_PRIMARY_ACTION} ${buttonStyles.disabled}`,

  // Full-width primary action button (for "Done", "Confirm" dialogs)
  buttonFullWidth: `${buttonStyles.base} button-standard w-full px-3 py-2 text-sm gap-2 ${buttonStyles.variants.primary}`,

  // Centered compact icon actions preserve their semantic colors.
  iconButton: `${buttonStyles.base} w-6 h-6 hover-ds-hover`,
  iconButtonConfirm: `${buttonStyles.base} w-6 h-6 ${STATUS_COLORS.success} hover-ds-hover hover-brightness-110 transition`,
  iconButtonRetry: `${buttonStyles.base} w-6 h-6 ${STATUS_COLORS.warning} hover-ds-hover hover-brightness-110 transition`,
  iconButtonCancel: `${buttonStyles.base} w-6 h-6 ${STATUS_COLORS.error} hover-ds-hover hover-brightness-110 transition`,
} as const;
