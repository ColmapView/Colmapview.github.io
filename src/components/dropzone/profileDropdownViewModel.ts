import type { CSSProperties } from 'react';
import { Z_INDEX } from '../../theme';

export const PROFILE_DROPDOWN_FALLBACK_LABEL = 'Profile';
export const PROFILE_DROPDOWN_TOOLTIP = 'Select settings profile';
export const PROFILE_DROPDOWN_MENU_CLASS =
  'absolute top-full right-0 mt-1 bg-ds-tertiary border border-ds rounded shadow-lg min-w-[120px] py-1';

const PROFILE_DROPDOWN_CHEVRON_CLASS = 'w-3 h-3 transition-transform';
const PROFILE_DROPDOWN_OPTION_BASE_CLASS =
  'w-full text-left px-3 py-1.5 cursor-pointer hover-ds-hover text-sm';
const PROFILE_DROPDOWN_ACTIVE_OPTION_CLASS = 'bg-ds-hover text-ds-accent';
const PROFILE_DROPDOWN_INACTIVE_OPTION_CLASS = 'text-ds-primary';

export interface ProfileDropdownOptionRow {
  name: string;
  isActive: boolean;
  className: string;
}

export function getProfileDropdownButtonLabel(activeProfile: string | null | undefined): string {
  return activeProfile || PROFILE_DROPDOWN_FALLBACK_LABEL;
}

export function getProfileDropdownChevronClass(isOpen: boolean): string {
  return `${PROFILE_DROPDOWN_CHEVRON_CLASS}${isOpen ? ' rotate-180' : ''}`;
}

export function getProfileDropdownOptionClass(isActive: boolean): string {
  return `${PROFILE_DROPDOWN_OPTION_BASE_CLASS} ${
    isActive ? PROFILE_DROPDOWN_ACTIVE_OPTION_CLASS : PROFILE_DROPDOWN_INACTIVE_OPTION_CLASS
  }`;
}

export function getProfileDropdownOptionRows(
  profileNames: readonly string[],
  activeProfile: string | null | undefined,
): ProfileDropdownOptionRow[] {
  return profileNames.map((name) => ({
    name,
    isActive: name === activeProfile,
    className: getProfileDropdownOptionClass(name === activeProfile),
  }));
}

export function getProfileDropdownMenuStyle(): CSSProperties {
  return {
    zIndex: Z_INDEX.dropdown,
  };
}
