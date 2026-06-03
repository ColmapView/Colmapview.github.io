/**
 * Defaults Generator
 *
 * Generates default configuration values from property registry definitions.
 */

import type { SectionDef } from '../types';
import { sections, getPersistedProperties } from '../index';
import type { AppConfiguration } from '../../configuration/types';
import {
  addConfigurationSection,
  createConfigurationFromSections,
  type ConfigurationSections,
} from './configurationRecord';

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
  const configSections: ConfigurationSections = {};

  for (const section of sections) {
    addConfigurationSection(configSections, section.key, generateSectionDefaults(section));
  }

  return createConfigurationFromSections(configSections);
}
