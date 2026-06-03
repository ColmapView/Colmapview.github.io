import { CONFIG_VERSION, type AppConfiguration } from '../../configuration/types';

export const CONFIGURATION_SECTION_KEYS = [
  'pointCloud',
  'camera',
  'ui',
  'export',
  'rig',
] as const satisfies readonly (keyof Omit<AppConfiguration, 'version'>)[];

export type ConfigurationSectionKey = typeof CONFIGURATION_SECTION_KEYS[number];
export type ConfigurationSections = Partial<Omit<AppConfiguration, 'version'>>;

const configurationSectionKeySet = new Set<string>(CONFIGURATION_SECTION_KEYS);

export function isConfigurationSectionKey(key: string): key is ConfigurationSectionKey {
  return configurationSectionKeySet.has(key);
}

export function addConfigurationSection(
  target: ConfigurationSections,
  key: string,
  value: AppConfiguration[ConfigurationSectionKey]
): void {
  if (!isConfigurationSectionKey(key)) {
    throw new Error(`Unsupported configuration section: ${key}`);
  }

  target[key] = value;
}

function getRequiredSection<K extends ConfigurationSectionKey>(
  sections: ConfigurationSections,
  key: K
): AppConfiguration[K] {
  const value = sections[key];
  if (!value) {
    throw new Error(`Missing configuration section: ${key}`);
  }

  return value;
}

export function createConfigurationFromSections(sections: ConfigurationSections): AppConfiguration {
  return {
    version: CONFIG_VERSION,
    pointCloud: getRequiredSection(sections, 'pointCloud'),
    camera: getRequiredSection(sections, 'camera'),
    ui: getRequiredSection(sections, 'ui'),
    export: getRequiredSection(sections, 'export'),
    rig: getRequiredSection(sections, 'rig'),
  };
}
