import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE_NAME } from '../../store/profileTypes';
import { Z_INDEX } from '../../theme';
import {
  canDeleteProfile,
  createProfileDeleteConfirmation,
  getProfileSelectorButtonLabel,
  getProfileSelectorCreateIntent,
  getProfileSelectorCreateKeyAction,
  getProfileSelectorMenuStyle,
  getProfileSelectorOptionClass,
  getProfileSelectorOptionRows,
  getProfileSelectorSaveIntent,
  normalizeProfileName,
  PROFILE_SELECTOR_FALLBACK_LABEL,
  PROFILE_SELECTOR_MENU_CLASS,
  PROFILE_SELECTOR_NEW_PROFILE_LABEL,
  PROFILE_SELECTOR_SAVE_LABEL,
} from './profileSelectorViewModel';

describe('profile selector view model', () => {
  it('falls back to select copy when no profile is active', () => {
    expect(getProfileSelectorButtonLabel(null)).toBe(PROFILE_SELECTOR_FALLBACK_LABEL);
    expect(getProfileSelectorButtonLabel(undefined)).toBe(PROFILE_SELECTOR_FALLBACK_LABEL);
    expect(getProfileSelectorButtonLabel('')).toBe(PROFILE_SELECTOR_FALLBACK_LABEL);
  });

  it('uses the active profile as the select button label', () => {
    expect(getProfileSelectorButtonLabel('Dense')).toBe('Dense');
  });

  it('derives the save intent from the active profile state', () => {
    expect(getProfileSelectorSaveIntent(DEFAULT_PROFILE_NAME, true)).toEqual({ type: 'create' });
    expect(getProfileSelectorSaveIntent('Dense', false)).toEqual({ type: 'save', profileName: 'Dense' });
    expect(getProfileSelectorSaveIntent(null, false)).toEqual({ type: 'none' });
  });

  it('marks active, default, and deletable profile rows', () => {
    expect(getProfileSelectorOptionRows([DEFAULT_PROFILE_NAME, 'Dense', 'Draft'], 'Dense')).toEqual([
      {
        name: DEFAULT_PROFILE_NAME,
        isActive: false,
        isDefault: true,
        canDelete: false,
        className: getProfileSelectorOptionClass(false),
      },
      {
        name: 'Dense',
        isActive: true,
        isDefault: false,
        canDelete: true,
        className: getProfileSelectorOptionClass(true),
      },
      {
        name: 'Draft',
        isActive: false,
        isDefault: false,
        canDelete: true,
        className: getProfileSelectorOptionClass(false),
      },
    ]);
  });

  it('guards profile deletion for default and single-profile states', () => {
    expect(canDeleteProfile(3, DEFAULT_PROFILE_NAME)).toBe(false);
    expect(canDeleteProfile(1, 'Dense')).toBe(false);
    expect(canDeleteProfile(2, 'Dense')).toBe(true);
  });

  it('normalizes new profile names before saving', () => {
    expect(normalizeProfileName('  Dense Draft  ')).toBe('Dense Draft');
    expect(getProfileSelectorCreateIntent('  Dense Draft  ')).toEqual({
      type: 'save',
      profileName: 'Dense Draft',
    });
    expect(getProfileSelectorCreateIntent('   ')).toEqual({ type: 'none' });
  });

  it('maps create-profile keyboard events to actions', () => {
    expect(getProfileSelectorCreateKeyAction('Enter')).toBe('confirm');
    expect(getProfileSelectorCreateKeyAction('Escape')).toBe('cancel');
    expect(getProfileSelectorCreateKeyAction('Tab')).toBe('none');
  });

  it('builds the delete confirmation request', () => {
    expect(createProfileDeleteConfirmation('Dense')).toEqual({
      title: 'Delete profile?',
      message: 'Delete profile "Dense"?',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
  });

  it('exposes stable selector metadata without dynamic Tailwind z-index classes', () => {
    expect(PROFILE_SELECTOR_SAVE_LABEL).toBe('Save Profile');
    expect(PROFILE_SELECTOR_NEW_PROFILE_LABEL).toBe('+ New Profile');
    expect(PROFILE_SELECTOR_MENU_CLASS).toContain('absolute top-full left-0 right-0');
    expect(PROFILE_SELECTOR_MENU_CLASS).not.toContain('z-[');
    expect(getProfileSelectorMenuStyle()).toEqual({
      zIndex: Z_INDEX.dropdown,
    });
  });
});
