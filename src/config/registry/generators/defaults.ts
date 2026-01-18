/**
 * Defaults Generator
 *
 * Generates default configuration values from property registry definitions.
 */

import type { SectionDef } from '../types';
import { sections, getPersistedProperties } from '../index';
import { CONFIG_VERSION } from '../../configuration/types';
import type { AppConfiguration } from '../../configuration/types';

/**
 * Generate defaults for a single section
 */
export function generateSectionDefaults(section: SectionDef): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const prop of getPersistedProperties(section)) {
    defaults[prop.key] = prop.default;
  }

  return defaults;
}

/**
 * Generate the full default configuration
 */
export function generateDefaultConfiguration(): AppConfiguration {
  const config: Record<string, unknown> = {
    version: CONFIG_VERSION,
  };

  for (const section of sections) {
    config[section.key] = generateSectionDefaults(section);
  }

  return config as unknown as AppConfiguration;
}
