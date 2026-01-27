/**
 * Type definitions for the settings profile storage system.
 */

import type { AppConfiguration } from '../config/configuration';

/**
 * A saved profile containing a full configuration snapshot.
 */
export interface ProfilesData {
  /** Map of profile name to full configuration */
  profiles: Record<string, AppConfiguration>;
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
