import { validateConfiguration } from '../config/configuration';
import { STORAGE_KEYS } from '../store/migration';
import {
  DEFAULT_PROFILE_NAME,
  DEFAULT_PROFILES_DATA,
  type ProfilesData,
} from '../store/profileTypes';

interface ProfilesStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeActiveProfile(activeProfile: unknown, profiles: ProfilesData['profiles']): string | null {
  if (typeof activeProfile !== 'string') return null;
  if (activeProfile === DEFAULT_PROFILE_NAME || activeProfile in profiles) return activeProfile;
  return null;
}

export function normalizeProfilesData(value: unknown): ProfilesData {
  if (!isRecord(value) || !isRecord(value.profiles)) {
    return DEFAULT_PROFILES_DATA;
  }

  const profiles: ProfilesData['profiles'] = {};
  for (const [name, config] of Object.entries(value.profiles)) {
    if (name === DEFAULT_PROFILE_NAME) continue;

    const validation = validateConfiguration(config);
    if (validation.valid && validation.config !== null) {
      profiles[name] = validation.config;
    }
  }

  return {
    profiles,
    activeProfile: normalizeActiveProfile(value.activeProfile, profiles),
  };
}

export function parseProfilesDataJson(stored: string | null): ProfilesData {
  if (!stored) return DEFAULT_PROFILES_DATA;

  try {
    return normalizeProfilesData(JSON.parse(stored));
  } catch {
    return DEFAULT_PROFILES_DATA;
  }
}

export function serializeProfilesData(data: ProfilesData): string {
  const { [DEFAULT_PROFILE_NAME]: _default, ...userProfiles } = data.profiles;
  void _default;

  return JSON.stringify({
    profiles: userProfiles,
    activeProfile: normalizeActiveProfile(data.activeProfile, userProfiles),
  });
}

export function loadProfilesData(storage: ProfilesStorageLike = localStorage): ProfilesData {
  return parseProfilesDataJson(storage.getItem(STORAGE_KEYS.profiles));
}

export function saveProfilesData(data: ProfilesData, storage: ProfilesStorageLike = localStorage): void {
  storage.setItem(STORAGE_KEYS.profiles, serializeProfilesData(data));
}
