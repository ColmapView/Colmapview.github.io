/**
 * Store Adapter Generator
 *
 * Generates store adapter functions from property registry definitions.
 * Handles extracting config from stores, applying config to stores, and resetting to defaults.
 */

import type { PropertyDef } from '../types';
import { sections, getPersistedProperties, getStoreKey } from '../index';
import type { AppConfiguration, PartialAppConfiguration } from '../../configuration/types';
import { getStoreConfigAdapter } from './storeAdapters';
import {
  addConfigurationSection,
  createConfigurationFromSections,
  isConfigurationSectionKey,
  type ConfigurationSections,
} from './configurationRecord';

type StoreStateRecord = Record<string, unknown>;

function isRecord(value: unknown): value is StoreStateRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getConfigurationSection(
  config: PartialAppConfiguration,
  sectionKey: string
): StoreStateRecord | undefined {
  if (!isConfigurationSectionKey(sectionKey)) {
    throw new Error(`Unsupported configuration section: ${sectionKey}`);
  }

  const sectionConfig = config[sectionKey];
  if (sectionConfig === undefined) {
    return undefined;
  }

  if (!isRecord(sectionConfig)) {
    throw new Error(`Configuration section ${sectionKey} must be an object`);
  }

  return sectionConfig;
}

// Handle nullable number conversion: Infinity in store <-> null in config
function storeToConfigValue(prop: PropertyDef, storeValue: unknown): unknown {
  if (prop.type === 'number' && prop.nullable && storeValue === Infinity) {
    return null;
  }
  return storeValue;
}

function configToStoreValue(prop: PropertyDef, configValue: unknown): unknown {
  if (prop.type === 'number' && prop.nullable && configValue === null) {
    return Infinity;
  }
  return configValue;
}

/**
 * Extract full configuration from all stores
 */
export function extractConfigurationFromStores(): AppConfiguration {
  const configSections: ConfigurationSections = {};

  for (const section of sections) {
    const adapter = getStoreConfigAdapter(section.storeHook);
    const sectionConfig: StoreStateRecord = {};

    for (const prop of getPersistedProperties(section)) {
      const storeKey = getStoreKey(prop);
      sectionConfig[prop.key] = storeToConfigValue(prop, adapter.read(storeKey));
    }

    addConfigurationSection(configSections, section.key, sectionConfig);
  }

  return createConfigurationFromSections(configSections);
}

/**
 * Apply partial configuration to all stores
 */
export function applyConfigurationToStores(config: PartialAppConfiguration): void {
  for (const section of sections) {
    const sectionConfig = getConfigurationSection(config, section.key);
    if (!sectionConfig) continue;

    const adapter = getStoreConfigAdapter(section.storeHook);

    for (const prop of getPersistedProperties(section)) {
      const configValue = sectionConfig[prop.key];
      if (configValue === undefined) continue;

      const storeKey = getStoreKey(prop);
      adapter.write(storeKey, configToStoreValue(prop, configValue));
    }
  }
}

/**
 * Reset all stores to defaults
 */
export function resetToDefaults(): void {
  for (const section of sections) {
    const adapter = getStoreConfigAdapter(section.storeHook);

    for (const prop of getPersistedProperties(section)) {
      const storeKey = getStoreKey(prop);
      adapter.write(storeKey, configToStoreValue(prop, prop.default));
    }
  }
}
