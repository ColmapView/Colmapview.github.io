/**
 * ProfileSelector component for managing settings profiles.
 * Provides save, load, and delete operations for named configuration profiles.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useProfiles } from '../../hooks/useProfiles';
import { useClickOutside } from '../../hooks/useClickOutside';
import { TrashIcon } from '../../icons';
import { controlPanelStyles } from '../../theme';
import { requestConfirmation } from '../../utils/confirmation';
import {
  createProfileDeleteConfirmation,
  getProfileSelectorButtonLabel,
  getProfileSelectorCreateIntent,
  getProfileSelectorCreateKeyAction,
  getProfileSelectorMenuStyle,
  getProfileSelectorOptionRows,
  getProfileSelectorSaveIntent,
  PROFILE_SELECTOR_CREATE_BUTTON_CLASS,
  PROFILE_SELECTOR_CREATE_INPUT_CLASS,
  PROFILE_SELECTOR_CREATE_INPUT_WRAPPER_CLASS,
  PROFILE_SELECTOR_DELETE_BUTTON_CLASS,
  PROFILE_SELECTOR_LABEL,
  PROFILE_SELECTOR_MENU_CLASS,
  PROFILE_SELECTOR_NAME_PLACEHOLDER,
  PROFILE_SELECTOR_NEW_PROFILE_LABEL,
  PROFILE_SELECTOR_OPTION_SELECT_BUTTON_CLASS,
  PROFILE_SELECTOR_SAVE_LABEL,
  PROFILE_SELECTOR_TRIGGER_CARET_CLASS,
} from './profileSelectorViewModel';
import { useProfileSelectorStoreFacade } from './useProfileSelectorStoreFacade';

const styles = controlPanelStyles;

export function ProfileSelector() {
  const {
    profileNames,
    activeProfile,
    isActiveProfileReadOnly,
    saveProfile,
    loadProfile,
    deleteProfile,
    suggestName,
  } = useProfiles();
  const { addNotification } = useProfileSelectorStoreFacade();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside or pressing Escape
  const handleCloseDropdown = useCallback(() => {
    setIsDropdownOpen(false);
    setIsCreating(false);
  }, []);
  useClickOutside(dropdownRef, handleCloseDropdown, isDropdownOpen);

  // Focus input when creating new profile
  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isCreating]);

  const handleSave = useCallback(() => {
    const intent = getProfileSelectorSaveIntent(activeProfile, isActiveProfileReadOnly);
    if (intent.type === 'create') {
      // Default is selected - create a new profile instead
      setNewName(suggestName());
      setIsCreating(true);
      setIsDropdownOpen(true);
    } else if (intent.type === 'save') {
      saveProfile(intent.profileName);
      addNotification('info', `Profile "${intent.profileName}" saved`);
    }
  }, [activeProfile, isActiveProfileReadOnly, saveProfile, suggestName, addNotification]);

  const handleSelectProfile = useCallback((name: string) => {
    loadProfile(name);
    setIsDropdownOpen(false);
  }, [loadProfile]);

  const handleDeleteProfile = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (profileNames.length <= 1) return;
    if (await requestConfirmation(createProfileDeleteConfirmation(name))) {
      deleteProfile(name);
    }
  }, [profileNames.length, deleteProfile]);

  const handleStartCreate = useCallback(() => {
    setNewName(suggestName());
    setIsCreating(true);
  }, [suggestName]);

  const handleConfirmCreate = useCallback(() => {
    const intent = getProfileSelectorCreateIntent(newName);
    if (intent.type === 'none') return;
    saveProfile(intent.profileName);
    addNotification('info', `Profile "${intent.profileName}" saved`);
    setIsCreating(false);
    setNewName('');
    setIsDropdownOpen(false);
  }, [newName, saveProfile, addNotification]);

  const handleCancelCreate = useCallback(() => {
    setIsCreating(false);
    setNewName('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const action = getProfileSelectorCreateKeyAction(e.key);
    if (action === 'confirm') {
      handleConfirmCreate();
    } else if (action === 'cancel') {
      handleCancelCreate();
    }
  }, [handleConfirmCreate, handleCancelCreate]);

  const profileRows = getProfileSelectorOptionRows(profileNames, activeProfile);

  return (
    <>
      {/* Profile selector row with custom dropdown */}
      <div className={styles.row}>
        <label className={styles.label}>{PROFILE_SELECTOR_LABEL}</label>
        <div className="relative flex-1" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen((current) => !current)}
            className={`${styles.selectRight} text-left flex items-center justify-between`}
            aria-haspopup="listbox"
            aria-expanded={isDropdownOpen}
          >
            <span className="truncate">{getProfileSelectorButtonLabel(activeProfile)}</span>
            <span className={PROFILE_SELECTOR_TRIGGER_CARET_CLASS}>▾</span>
          </button>

          {isDropdownOpen && (
            <div className={PROFILE_SELECTOR_MENU_CLASS} style={getProfileSelectorMenuStyle()} role="listbox">
              {profileRows.map((row) => (
                <div
                  key={row.name}
                  className={row.className}
                  role="option"
                  aria-selected={row.isActive}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectProfile(row.name)}
                    className={PROFILE_SELECTOR_OPTION_SELECT_BUTTON_CLASS}
                  >
                    <span className="block truncate">{row.name}</span>
                  </button>
                  {row.canDelete && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteProfile(row.name, e)}
                      className={PROFILE_SELECTOR_DELETE_BUTTON_CLASS}
                      aria-label={`Delete profile ${row.name}`}
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {/* New profile input or button */}
              {isCreating ? (
                <div className={PROFILE_SELECTOR_CREATE_INPUT_WRAPPER_CLASS}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleCancelCreate}
                    placeholder={PROFILE_SELECTOR_NAME_PLACEHOLDER}
                    className={PROFILE_SELECTOR_CREATE_INPUT_CLASS}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleStartCreate}
                  className={PROFILE_SELECTOR_CREATE_BUTTON_CLASS}
                >
                  {PROFILE_SELECTOR_NEW_PROFILE_LABEL}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Save Profile button - creates new profile if Default is selected */}
      <div className={styles.actionGroup}>
        <button
          onClick={handleSave}
          className={styles.actionButton}
        >
          {PROFILE_SELECTOR_SAVE_LABEL}
        </button>
      </div>
    </>
  );
}
