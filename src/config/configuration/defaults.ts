/**
 * Configuration Defaults
 *
 * Re-exports the generated default configuration from the property registry.
 */

import { generateDefaultConfiguration } from '../registry/generators/defaults';
import type { AppConfiguration } from './types';

/**
 * Get the default configuration with all properties set to their defaults.
 * Generated from the property registry.
 */
export function getDefaultConfiguration(): AppConfiguration {
  return generateDefaultConfiguration();
}
