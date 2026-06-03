/**
 * Zod Schema Generator
 *
 * Generates Zod validation schemas from property registry definitions.
 */

import { z, type ZodTypeAny } from 'zod';
import type {
  PropertyDef,
  SectionDef,
} from '../types';
import { sections, getPersistedProperties } from '../index';
import { CONFIG_VERSION } from '../../configuration/types';

export type GeneratedSectionSchema = z.ZodOptional<z.ZodObject<Record<string, ZodTypeAny>>>;

function assertNever(value: never): never {
  throw new Error(`Unsupported property definition: ${JSON.stringify(value)}`);
}

/**
 * Generate a Zod schema for a single property
 */
export function generatePropertySchema(prop: PropertyDef): ZodTypeAny {
  switch (prop.type) {
    case 'number': {
      let numSchema = z.number();
      if (prop.min !== undefined) numSchema = numSchema.min(prop.min);
      if (prop.max !== undefined) numSchema = numSchema.max(prop.max);
      if (prop.isInt) numSchema = numSchema.int();
      const schema = prop.nullable === true ? numSchema.nullable() : numSchema;
      return schema.optional();
    }

    case 'boolean': {
      return z.boolean().optional();
    }

    case 'string': {
      let strSchema = z.string();
      if (prop.pattern) {
        const errorMsg = prop.patternDesc
          ? `Invalid format: expected ${prop.patternDesc}`
          : 'Invalid format';
        strSchema = strSchema.regex(prop.pattern, errorMsg);
      }
      return strSchema.optional();
    }

    case 'enum': {
      return z.enum(prop.enumValues).optional();
    }

    default: {
      return assertNever(prop);
    }
  }
}

/**
 * Generate a Zod schema for a section
 */
export function generateSectionSchema(section: SectionDef): GeneratedSectionSchema {
  const shape: Record<string, ZodTypeAny> = {};

  for (const prop of getPersistedProperties(section)) {
    shape[prop.key] = generatePropertySchema(prop);
  }

  return z.object(shape).optional();
}

/**
 * Generate the full app configuration schema
 */
export function generateAppConfigurationSchema(): z.ZodObject<Record<string, ZodTypeAny>> {
  const shape: Record<string, ZodTypeAny> = {
    version: z.number().int().min(1).max(CONFIG_VERSION).optional(),
  };

  for (const section of sections) {
    shape[section.key] = generateSectionSchema(section);
  }

  return z.object(shape);
}

// Pre-generated schema for runtime use
export const generatedAppConfigurationSchema = generateAppConfigurationSchema();
