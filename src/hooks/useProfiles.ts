/**
 * Custom hook for managing settings profiles.
 * Provides CRUD operations for saving, loading, and deleting named profile configurations.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { STORAGE_KEYS } from '../store/migration';
import { extractConfigurationFromStores, applyConfigurationToStores, getDefaultConfiguration } from '../config/configuration';
import type { ProfilesData } from '../store/profileTypes';
import { DEFAULT_PROFILES_DATA } from '../store/profileTypes';

/** The default profile name - this profile is read-only and always uses project defaults */
const DEFAULT_PROFILE_NAME = 'Default';

/**
 * Load profiles data from localStorage.
 */
function loadProfilesData(): ProfilesData {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.profiles);
    if (!stored) return DEFAULT_PROFILES_DATA;
    const parsed = JSON.parse(stored);
    // Basic validation
    if (typeof parsed.profiles !== 'object' || parsed.profiles === null) {
      return DEFAULT_PROFILES_DATA;
    }
    return {
      profiles: parsed.profiles,
      activeProfile: parsed.activeProfile ?? null,
    };
  } catch {
    return DEFAULT_PROFILES_DATA;
  }
}

/**
 * Save profiles data to localStorage.
 * Excludes the Default profile since it's always computed fresh.
 */
function saveProfilesData(data: ProfilesData): void {
  // Don't store the Default profile - it's always computed fresh
  const { [DEFAULT_PROFILE_NAME]: _default, ...userProfiles } = data.profiles;
  void _default;
  localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify({
    profiles: userProfiles,
    activeProfile: data.activeProfile,
  }));
}

/**
 * Generate a default profile name like "Profile 1", "Profile 2", etc.
 */
function generateDefaultName(existingNames: string[]): string {
  let counter = 1;
  while (existingNames.includes(`Profile ${counter}`)) {
    counter++;
  }
  return `Profile ${counter}`;
}

/**
 * Hook providing profile CRUD operations.
 */
export function useProfiles() {
  const [profilesData, setProfilesData] = useState<ProfilesData>(loadProfilesData);

  // Sync to localStorage whenever state changes
  useEffect(() => {
    saveProfilesData(profilesData);
  }, [profilesData]);

  const profileNames = useMemo(() => {
    const names = Object.keys(profilesData.profiles);
    // Always include Default at the top
    if (!names.includes(DEFAULT_PROFILE_NAME)) {
      names.unshift(DEFAULT_PROFILE_NAME);
    }
    return names.sort((a, b) => {
      // Default always first
      if (a === DEFAULT_PROFILE_NAME) return -1;
      if (b === DEFAULT_PROFILE_NAME) return 1;
      return a.localeCompare(b);
    });
  }, [profilesData.profiles]);

  const activeProfile = profilesData.activeProfile;
  const isActiveProfileReadOnly = activeProfile === DEFAULT_PROFILE_NAME;

  /**
   * Save current settings as a named profile.
   * If name already exists, it will be overwritten.
   */
  const saveProfile = useCallback((name: string) => {
    const config = extractConfigurationFromStores();
    setProfilesData(prev => ({
      profiles: { ...prev.profiles, [name]: config },
      activeProfile: name,
    }));
  }, []);

  /**
   * Load and apply a profile's settings.
   * Default profile always uses fresh project defaults.
   */
  const loadProfile = useCallback((name: string) => {
    // Default profile always uses fresh project defaults
    const config = name === DEFAULT_PROFILE_NAME
      ? getDefaultConfiguration()
      : profilesData.profiles[name];
    if (!config) return;
    applyConfigurationToStores(config);
    setProfilesData(prev => ({ ...prev, activeProfile: name }));
  }, [profilesData.profiles]);

  /**
   * Delete a profile by name. Cannot delete the Default profile.
   */
  const deleteProfile = useCallback((name: string) => {
    if (name === DEFAULT_PROFILE_NAME) return; // Protect default profile
    setProfilesData(prev => {
      const { [name]: _removed, ...remaining } = prev.profiles;
      void _removed; // Satisfy lint - variable used for destructuring removal
      return {
        profiles: remaining,
        // Switch to Default if the deleted profile was active
        activeProfile: prev.activeProfile === name ? DEFAULT_PROFILE_NAME : prev.activeProfile,
      };
    });
  }, []);

  /**
   * Clear the active profile selection (settings remain but profile is deselected).
   */
  const clearActiveProfile = useCallback(() => {
    setProfilesData(prev => ({ ...prev, activeProfile: null }));
  }, []);

  /**
   * Generate a suggested name for a new profile.
   */
  const suggestName = useCallback(() => {
    return generateDefaultName(profileNames);
  }, [profileNames]);

  return {
    profileNames,
    activeProfile,
    isActiveProfileReadOnly,
    saveProfile,
    loadProfile,
    deleteProfile,
    clearActiveProfile,
    suggestName,
  };
}
