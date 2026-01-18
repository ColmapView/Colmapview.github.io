/**
 * Zod Schema Generator
 *
 * Generates Zod validation schemas from property registry definitions.
 */

import { z, type ZodTypeAny } from 'zod';
import type {
  PropertyDef,
  SectionDef,
  NumberPropertyDef,
  NullableNumberPropertyDef,
  StringPropertyDef,
  EnumPropertyDef,
} from '../types';
import { sections, getPersistedProperties } from '../index';
import { CONFIG_VERSION } from '../../configuration/types';

/**
 * Generate a Zod schema for a single property
 */
export function generatePropertySchema(prop: PropertyDef): ZodTypeAny {
  let schema: ZodTypeAny;

  switch (prop.type) {
    case 'number': {
      const numProp = prop as NumberPropertyDef | NullableNumberPropertyDef;
      let numSchema = z.number();
      if (numProp.min !== undefined) numSchema = numSchema.min(numProp.min);
      if (numProp.max !== undefined) numSchema = numSchema.max(numProp.max);
      if (numProp.isInt) numSchema = numSchema.int();
      schema = numSchema;
      if (numProp.nullable === true) {
        schema = numSchema.nullable();
      }
      break;
    }

    case 'boolean': {
      schema = z.boolean();
      break;
    }

    case 'string': {
      const strProp = prop as StringPropertyDef;
      let strSchema = z.string();
      if (strProp.pattern) {
        const errorMsg = strProp.patternDesc
          ? `Invalid format: expected ${strProp.patternDesc}`
          : 'Invalid format';
        strSchema = strSchema.regex(strProp.pattern, errorMsg);
      }
      schema = strSchema;
      break;
    }

    case 'enum': {
      const enumProp = prop as EnumPropertyDef;
      schema = z.enum(enumProp.enumValues as [string, ...string[]]);
      break;
    }

    default: {
      // Fallback for unknown types
      schema = z.unknown();
    }
  }

  // All config properties are optional (partial config support)
  return schema.optional();
}

/**
 * Generate a Zod schema for a section
 */
export function generateSectionSchema(section: SectionDef): z.ZodObject<Record<string, ZodTypeAny>> {
  const shape: Record<string, ZodTypeAny> = {};

  for (const prop of getPersistedProperties(section)) {
    shape[prop.key] = generatePropertySchema(prop);
  }

  return z.object(shape).optional() as unknown as z.ZodObject<Record<string, ZodTypeAny>>;
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
