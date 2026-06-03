import type { CSSProperties } from 'react';
import { Z_INDEX } from '../../theme';
import type { ConfirmationRequest } from '../../utils/confirmation';
import { DEFAULT_PROFILE_NAME } from '../../store/profileTypes';

export const PROFILE_SELECTOR_LABEL = 'Profile';
export const PROFILE_SELECTOR_FALLBACK_LABEL = 'Select...';
export const PROFILE_SELECTOR_SAVE_LABEL = 'Save Profile';
export const PROFILE_SELECTOR_NAME_PLACEHOLDER = 'Profile name';
export const PROFILE_SELECTOR_NEW_PROFILE_LABEL = '+ New Profile';
export const PROFILE_SELECTOR_MENU_CLASS =
  'absolute top-full left-0 right-0 mt-1 bg-ds-tertiary border border-ds rounded shadow-lg py-1';
export const PROFILE_SELECTOR_TRIGGER_CARET_CLASS = 'ml-1 text-ds-muted';
export const PROFILE_SELECTOR_OPTION_SELECT_BUTTON_CLASS = 'min-w-0 flex-1 text-left cursor-pointer';
export const PROFILE_SELECTOR_DELETE_BUTTON_CLASS = 'p-0.5 text-ds-muted hover-ds-text-primary ml-2 flex-shrink-0';
export const PROFILE_SELECTOR_CREATE_INPUT_WRAPPER_CLASS = 'px-2 py-1 border-t border-ds mt-1';
export const PROFILE_SELECTOR_CREATE_INPUT_CLASS =
  'w-full bg-ds-input text-ds-primary text-sm px-1.5 py-0.5 rounded border border-ds focus-ds';
export const PROFILE_SELECTOR_CREATE_BUTTON_CLASS =
  'w-full text-left px-2 py-1 cursor-pointer hover-ds-hover text-sm text-ds-muted border-t border-ds mt-1';

const PROFILE_SELECTOR_OPTION_BASE_CLASS = 'flex items-center justify-between px-2 py-1 hover-ds-hover text-sm';
const PROFILE_SELECTOR_ACTIVE_OPTION_CLASS = 'bg-ds-hover text-ds-accent';
const PROFILE_SELECTOR_INACTIVE_OPTION_CLASS = 'text-ds-primary';

export interface ProfileSelectorOptionRow {
  name: string;
  isActive: boolean;
  isDefault: boolean;
  canDelete: boolean;
  className: string;
}

export type ProfileSelectorSaveIntent =
  | { type: 'create' }
  | { type: 'save'; profileName: string }
  | { type: 'none' };

export type ProfileSelectorCreateIntent =
  | { type: 'save'; profileName: string }
  | { type: 'none' };

export type ProfileSelectorCreateKeyAction = 'confirm' | 'cancel' | 'none';

export function getProfileSelectorButtonLabel(activeProfile: string | null | undefined): string {
  return activeProfile || PROFILE_SELECTOR_FALLBACK_LABEL;
}

export function getProfileSelectorOptionClass(isActive: boolean): string {
  return `${PROFILE_SELECTOR_OPTION_BASE_CLASS} ${
    isActive ? PROFILE_SELECTOR_ACTIVE_OPTION_CLASS : PROFILE_SELECTOR_INACTIVE_OPTION_CLASS
  }`;
}

export function canDeleteProfile(profileCount: number, profileName: string): boolean {
  return profileCount > 1 && profileName !== DEFAULT_PROFILE_NAME;
}

export function getProfileSelectorOptionRows(
  profileNames: readonly string[],
  activeProfile: string | null | undefined,
): ProfileSelectorOptionRow[] {
  return profileNames.map((name) => ({
    name,
    isActive: name === activeProfile,
    isDefault: name === DEFAULT_PROFILE_NAME,
    canDelete: canDeleteProfile(profileNames.length, name),
    className: getProfileSelectorOptionClass(name === activeProfile),
  }));
}

export function getProfileSelectorSaveIntent(
  activeProfile: string | null | undefined,
  isActiveProfileReadOnly: boolean,
): ProfileSelectorSaveIntent {
  if (isActiveProfileReadOnly) {
    return { type: 'create' };
  }

  if (activeProfile) {
    return { type: 'save', profileName: activeProfile };
  }

  return { type: 'none' };
}

export function normalizeProfileName(profileName: string): string {
  return profileName.trim();
}

export function getProfileSelectorCreateIntent(profileName: string): ProfileSelectorCreateIntent {
  const normalizedName = normalizeProfileName(profileName);
  if (!normalizedName) return { type: 'none' };
  return { type: 'save', profileName: normalizedName };
}

export function getProfileSelectorCreateKeyAction(key: string): ProfileSelectorCreateKeyAction {
  if (key === 'Enter') return 'confirm';
  if (key === 'Escape') return 'cancel';
  return 'none';
}

export function createProfileDeleteConfirmation(profileName: string): ConfirmationRequest {
  return {
    title: 'Delete profile?',
    message: `Delete profile "${profileName}"?`,
    confirmLabel: 'Delete',
    tone: 'danger',
  };
}

export function getProfileSelectorMenuStyle(): CSSProperties {
  return {
    zIndex: Z_INDEX.dropdown,
  };
}
