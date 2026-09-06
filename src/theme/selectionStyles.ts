/** Shared tabs, switches, and selection controls. */
import { buttonStyles } from './buttonStyles';
import { inputStyles } from './formStyles';

export const tabStyles = {
  compact: 'px-3 py-1.5 text-sm font-medium transition-colors bg-transparent text-ds-secondary hover-ds-text-primary cursor-pointer',
  compactActive: 'px-3 py-1.5 text-sm font-medium transition-colors bg-transparent text-ds-primary cursor-pointer',
  container: 'flex border-b border-ds',
  tab: `px-4 py-2 text-base font-medium transition-colors ${buttonStyles.variants.tab}`,
  tabActive: `px-4 py-2 text-base font-medium ${buttonStyles.variants.tabActive}`,
} as const;

export const toggleSwitchStyles = {
  // Outer track (oval container)
  track: 'relative inline-flex items-center cursor-pointer transition-colors duration-200 rounded-full',
  trackSm: 'w-7 h-4',   // Small: 28x16px
  trackMd: 'w-9 h-5',   // Medium: 36x20px (default)
  trackLg: 'w-11 h-6',  // Large: 44x24px

  // Track colors
  trackOff: 'bg-ds-secondary border border-ds-light',
  trackOn: 'bg-ds-accent border border-ds-accent',

  // Inner circle (thumb) - base styles only, position via inline style.
  // Deliberately flat: `shadow-sm` was listed here but never defined in index.css,
  // so every toggle in the app has always rendered without a drop shadow. The ramp
  // does offer `shadow-ds-sm`, but switching it on would change live pixels app-wide
  // for no reason (same keep-current-pixels call as DROP_ZONE_BROWSE_BOX_CLASS's
  // border). This is the canonical note; the profile menus point back here.
  thumb: 'absolute bg-white rounded-full transition-all duration-200 ease-in-out',
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
  checkbox: inputStyles.checkbox,
  label: 'text-ds-secondary text-sm',
} as const;
