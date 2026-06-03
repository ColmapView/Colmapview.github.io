/**
 * Type definitions for the settings profile storage system.
 */

import type { PartialAppConfiguration } from '../config/configuration';

/** The default profile name - this profile is read-only and always uses project defaults */
export const DEFAULT_PROFILE_NAME = 'Default';

/**
 * Saved profile data. Profile entries may be full snapshots from the current
 * app or partial snapshots from older compatible storage.
 */
export interface ProfilesData {
  /** Map of profile name to validated configuration */
  profiles: Record<string, PartialAppConfiguration>;
  /** Currently selected profile name, or null if none */
  activeProfile: string | null;
}

/**
 * Default empty profiles data.
 */
export const DEFAULT_PROFILES_DATA: ProfilesData = {
  profiles: {},
  activeProfile: null,
};
