/**
 * Configuration Schema Validation
 *
 * Uses the generated Zod schema from the property registry.
 */

import { generatedAppConfigurationSchema } from '../registry/generators/schema';
import type { ConfigValidationResult, PartialAppConfiguration } from './types';
import type { z } from 'zod';

// Re-export the generated schema
export const appConfigurationSchema: z.ZodType<PartialAppConfiguration> =
  generatedAppConfigurationSchema;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeLegacyPointCloudConfig(config: unknown): unknown {
  if (!isRecord(config)) return config;

  const pointCloud = config.pointCloud;
  if (!isRecord(pointCloud)) return config;

  const normalizedPointCloud = { ...pointCloud };
  if (normalizedPointCloud.showSplats === true) {
    normalizedPointCloud.colorMode = 'splats';
  }
  delete normalizedPointCloud.showSplats;

  return {
    ...config,
    pointCloud: normalizedPointCloud,
  };
}

/**
 * Validate a configuration object against the schema.
 * Accepts partial configurations (all fields optional).
 */
export function validateConfiguration(config: unknown): ConfigValidationResult {
  const result = appConfigurationSchema.safeParse(normalizeLegacyPointCloudConfig(config));

  if (result.success) {
    return {
      valid: true,
      errors: [],
      config: result.data,
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
