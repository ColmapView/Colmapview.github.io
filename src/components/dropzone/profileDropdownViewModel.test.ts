import { describe, expect, it } from 'vitest';
import { Z_INDEX } from '../../theme';
import {
  getProfileDropdownButtonLabel,
  getProfileDropdownChevronClass,
  getProfileDropdownMenuStyle,
  getProfileDropdownOptionClass,
  getProfileDropdownOptionRows,
  PROFILE_DROPDOWN_FALLBACK_LABEL,
  PROFILE_DROPDOWN_MENU_CLASS,
  PROFILE_DROPDOWN_TOOLTIP,
} from './profileDropdownViewModel';

describe('profile dropdown view model', () => {
  it('falls back to a generic button label when no profile is active', () => {
    expect(getProfileDropdownButtonLabel(null)).toBe(PROFILE_DROPDOWN_FALLBACK_LABEL);
    expect(getProfileDropdownButtonLabel(undefined)).toBe(PROFILE_DROPDOWN_FALLBACK_LABEL);
    expect(getProfileDropdownButtonLabel('')).toBe(PROFILE_DROPDOWN_FALLBACK_LABEL);
  });

  it('uses the active profile as the button label', () => {
    expect(getProfileDropdownButtonLabel('Photogrammetry')).toBe('Photogrammetry');
  });

  it('rotates the chevron only while the menu is open', () => {
    expect(getProfileDropdownChevronClass(false)).toBe('w-3 h-3 transition-transform');
    expect(getProfileDropdownChevronClass(true)).toBe('w-3 h-3 transition-transform rotate-180');
  });

  it('builds active and inactive option classes', () => {
    expect(getProfileDropdownOptionClass(true)).toContain('bg-ds-hover text-ds-accent');
    expect(getProfileDropdownOptionClass(false)).toContain('text-ds-primary');
  });

  it('marks the active profile row and preserves display order', () => {
    expect(getProfileDropdownOptionRows(['Default', 'Dense', 'Draft'], 'Dense')).toEqual([
      {
        name: 'Default',
        isActive: false,
        className: getProfileDropdownOptionClass(false),
      },
      {
        name: 'Dense',
        isActive: true,
        className: getProfileDropdownOptionClass(true),
      },
      {
        name: 'Draft',
        isActive: false,
        className: getProfileDropdownOptionClass(false),
      },
    ]);
  });

  it('exposes stable menu metadata without dynamic Tailwind class construction', () => {
    expect(PROFILE_DROPDOWN_TOOLTIP).toBe('Select settings profile');
    expect(PROFILE_DROPDOWN_MENU_CLASS).toContain('absolute top-full right-0');
    expect(PROFILE_DROPDOWN_MENU_CLASS).not.toContain('z-[');
    expect(getProfileDropdownMenuStyle()).toEqual({
      zIndex: Z_INDEX.dropdown,
    });
  });
});
