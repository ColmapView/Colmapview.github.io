/**
 * Configuration Schema Validation
 *
 * Uses the generated Zod schema from the property registry.
 */

import { generatedAppConfigurationSchema } from '../registry/generators/schema';
import type { ConfigValidationResult, PartialAppConfiguration } from './types';

// Re-export the generated schema
export const appConfigurationSchema = generatedAppConfigurationSchema;

/**
 * Validate a configuration object against the schema.
 * Accepts partial configurations (all fields optional).
 */
export function validateConfiguration(config: unknown): ConfigValidationResult {
  const result = appConfigurationSchema.safeParse(config);

  if (result.success) {
    return {
      valid: true,
      errors: [],
      config: result.data as PartialAppConfiguration,
    };
  }

  const errors = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    value: undefined,
  }));

  return {
    valid: false,
    errors,
    config: null,
  };
}
