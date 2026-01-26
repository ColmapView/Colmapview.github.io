/**
 * Store Adapter Generator
 *
 * Generates store adapter functions from property registry definitions.
 * Handles extracting config from stores, applying config to stores, and resetting to defaults.
 */

import type { PropertyDef, StoreHook } from '../types';
import { sections, getPersistedProperties, getStoreKey } from '../index';
import { CONFIG_VERSION } from '../../configuration/types';
import type { AppConfiguration, PartialAppConfiguration } from '../../configuration/types';

import { usePointCloudStore } from '../../../store/stores/pointCloudStore';
import { useCameraStore } from '../../../store/stores/cameraStore';
import { useUIStore } from '../../../store/stores/uiStore';
import { useExportStore } from '../../../store/stores/exportStore';
import { useRigStore } from '../../../store/stores/rigStore';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = { getState: () => any };

const stores: Record<StoreHook, AnyStore> = {
  usePointCloudStore,
  useCameraStore,
  useUIStore,
  useExportStore,
  useRigStore,
};

function getStoreState(hookName: StoreHook): Record<string, unknown> {
  return stores[hookName].getState() as Record<string, unknown>;
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

function getSetterName(key: string): string {
  return `set${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

/**
 * Extract full configuration from all stores
 */
export function extractConfigurationFromStores(): AppConfiguration {
  const config: Record<string, unknown> = { version: CONFIG_VERSION };

  for (const section of sections) {
    const state = getStoreState(section.storeHook);
    const sectionConfig: Record<string, unknown> = {};

    for (const prop of getPersistedProperties(section)) {
      const storeKey = getStoreKey(prop);
      sectionConfig[prop.key] = storeToConfigValue(prop, state[storeKey]);
    }

    config[section.key] = sectionConfig;
  }

  return config as unknown as AppConfiguration;
}

/**
 * Apply partial configuration to all stores
 */
export function applyConfigurationToStores(config: PartialAppConfiguration): void {
  for (const section of sections) {
    const sectionConfig = config[section.key as keyof PartialAppConfiguration] as
      | Record<string, unknown>
      | undefined;
    if (!sectionConfig) continue;

    const state = getStoreState(section.storeHook);

    for (const prop of getPersistedProperties(section)) {
      const configValue = sectionConfig[prop.key];
      if (configValue === undefined) continue;

      const storeKey = getStoreKey(prop);
      const setter = state[getSetterName(storeKey)] as ((value: unknown) => void) | undefined;
      if (setter) {
        setter(configToStoreValue(prop, configValue));
      }
    }
  }
}

/**
 * Reset all stores to defaults
 */
export function resetToDefaults(): void {
  for (const section of sections) {
    const state = getStoreState(section.storeHook);

    for (const prop of getPersistedProperties(section)) {
      const storeKey = getStoreKey(prop);
      const setter = state[getSetterName(storeKey)] as ((value: unknown) => void) | undefined;
      if (setter) {
        setter(configToStoreValue(prop, prop.default));
      }
    }
  }
}
