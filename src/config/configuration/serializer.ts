/**
 * Configuration Serialization
 *
 * Handles YAML parsing and serialization of configuration.
 */

import * as YAML from 'js-yaml';
import { camelToSnake, snakeToCamel } from './converter';
import { validateConfiguration } from './schema';
import { generateConfigTemplate } from '../registry/generators/template';
import type { AppConfiguration, PartialAppConfiguration, ConfigValidationResult } from './types';

/**
 * Parse a YAML configuration string and validate it.
 */
export function parseConfigYaml(yamlString: string): ConfigValidationResult {
  try {
    const parsed = YAML.load(yamlString);

    if (parsed === null || parsed === undefined) {
      return {
        valid: false,
        errors: [{ path: '', message: 'Empty configuration file' }],
        config: null,
      };
    }

    if (typeof parsed !== 'object') {
      return {
        valid: false,
        errors: [{ path: '', message: 'Configuration must be an object' }],
        config: null,
      };
    }

    // Convert snake_case keys to camelCase
    const camelCased = snakeToCamel(parsed) as PartialAppConfiguration;

    // Validate the configuration
    return validateConfiguration(camelCased);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown YAML parse error';
    return {
      valid: false,
      errors: [{ path: '', message: `YAML parse error: ${message}` }],
      config: null,
    };
  }
}

/**
 * Serialize a configuration object to YAML format.
 */
export function serializeConfigToYaml(config: AppConfiguration): string {
  // Convert camelCase to snake_case for YAML output
  const snakeCased = camelToSnake(config);

  return YAML.dump(snakeCased, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
  });
}

// Re-export the template generator
export { generateConfigTemplate };
