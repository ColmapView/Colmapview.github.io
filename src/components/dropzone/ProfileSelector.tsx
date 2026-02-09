/**
 * ProfileSelector component for managing settings profiles.
 * Provides save, load, and delete operations for named configuration profiles.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useProfiles } from '../../hooks/useProfiles';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useNotificationStore } from '../../store/stores/notificationStore';
import { TrashIcon } from '../../icons';
import { controlPanelStyles, Z_INDEX } from '../../theme';

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
  const addNotification = useNotificationStore((s) => s.addNotification);

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
    if (isActiveProfileReadOnly) {
      // Default is selected - create a new profile instead
      setNewName(suggestName());
      setIsCreating(true);
      setIsDropdownOpen(true);
    } else if (activeProfile) {
      saveProfile(activeProfile);
      addNotification('info', `Profile "${activeProfile}" saved`);
    }
  }, [activeProfile, isActiveProfileReadOnly, saveProfile, suggestName, addNotification]);

  const handleSelectProfile = useCallback((name: string) => {
    loadProfile(name);
    setIsDropdownOpen(false);
  }, [loadProfile]);

  const handleDeleteProfile = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (profileNames.length <= 1) return;
    if (confirm(`Delete profile "${name}"?`)) {
      deleteProfile(name);
    }
  }, [profileNames.length, deleteProfile]);

  const handleStartCreate = useCallback(() => {
    setNewName(suggestName());
    setIsCreating(true);
  }, [suggestName]);

  const handleConfirmCreate = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    saveProfile(name);
    addNotification('info', `Profile "${name}" saved`);
    setIsCreating(false);
    setNewName('');
    setIsDropdownOpen(false);
  }, [newName, saveProfile, addNotification]);

  const handleCancelCreate = useCallback(() => {
    setIsCreating(false);
    setNewName('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirmCreate();
    } else if (e.key === 'Escape') {
      handleCancelCreate();
    }
  }, [handleConfirmCreate, handleCancelCreate]);

  return (
    <>
      {/* Profile selector row with custom dropdown */}
      <div className={styles.row}>
        <label className={styles.label}>Profile</label>
        <div className="relative flex-1" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={`${styles.selectRight} text-left flex items-center justify-between`}
          >
            <span className="truncate">{activeProfile || 'Select...'}</span>
            <span className="ml-1 text-ds-muted">▾</span>
          </button>

          {isDropdownOpen && (
            <div className={`absolute top-full left-0 right-0 mt-1 bg-ds-tertiary border border-ds rounded shadow-lg z-[${Z_INDEX.dropdown}] py-1`}>
              {profileNames.map((name) => {
                const isDefault = name === 'Default';
                return (
                  <div
                    key={name}
                    onClick={() => handleSelectProfile(name)}
                    className={`flex items-center justify-between px-2 py-1 cursor-pointer hover-ds-hover text-sm ${
                      name === activeProfile ? 'bg-ds-hover text-ds-accent' : 'text-ds-primary'
                    }`}
                  >
                    <span className="truncate">{name}</span>
                    {!isDefault && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteProfile(name, e)}
                        className="p-0.5 text-ds-muted hover-ds-text-primary ml-2 flex-shrink-0"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* New profile input or button */}
              {isCreating ? (
                <div className="px-2 py-1 border-t border-ds mt-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleCancelCreate}
                    placeholder="Profile name"
                    className="w-full bg-ds-input text-ds-primary text-sm px-1.5 py-0.5 rounded border border-ds focus-ds"
                  />
                </div>
              ) : (
                <div
                  onClick={handleStartCreate}
                  className="px-2 py-1 cursor-pointer hover-ds-hover text-sm text-ds-muted border-t border-ds mt-1"
                >
                  + New Profile
                </div>
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
          Save Profile
        </button>
      </div>
    </>
  );
}
