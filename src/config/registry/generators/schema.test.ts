import { describe, expect, it } from 'vitest';
import {
  generateAppConfigurationSchema,
  generatePropertySchema,
  generateSectionSchema,
} from './schema';
import type { PropertyDef, SectionDef } from '../types';
import { CSS_HEX_COLOR_PATTERN, CSS_HEX_COLOR_PATTERN_DESCRIPTION } from '../../../utils/hexColor';

describe('registry schema generator', () => {
  it('generates optional number schemas with min, max, integer, and nullable rules', () => {
    const schema = generatePropertySchema({
      key: 'count',
      type: 'number',
      default: 1,
      min: 1,
      max: 5,
      isInt: true,
      persist: true,
    });

    expect(schema.safeParse(undefined).success).toBe(true);
    expect(schema.safeParse(3).success).toBe(true);
    expect(schema.safeParse(0).success).toBe(false);
    expect(schema.safeParse(3.5).success).toBe(false);
    expect(schema.safeParse(null).success).toBe(false);

    const nullableSchema = generatePropertySchema({
      key: 'limit',
      type: 'number',
      default: null,
      nullable: true,
      min: 0,
      persist: true,
    });

    expect(nullableSchema.safeParse(null).success).toBe(true);
    expect(nullableSchema.safeParse(-1).success).toBe(false);
  });

  it('generates optional boolean, string-pattern, and enum schemas', () => {
    const booleanSchema = generatePropertySchema({
      key: 'enabled',
      type: 'boolean',
      default: false,
      persist: true,
    });

    expect(booleanSchema.safeParse(false).success).toBe(true);
    expect(booleanSchema.safeParse('false').success).toBe(false);

    const stringSchema = generatePropertySchema({
      key: 'color',
      type: 'string',
      default: '#ffffff',
      pattern: CSS_HEX_COLOR_PATTERN,
      patternDesc: CSS_HEX_COLOR_PATTERN_DESCRIPTION,
      persist: true,
    });

    expect(stringSchema.safeParse('#00ffaa').success).toBe(true);
    expect(stringSchema.safeParse('blue').success).toBe(false);

    const enumSchema = generatePropertySchema({
      key: 'mode',
      type: 'enum',
      enumValues: ['orbit', 'fly'],
      default: 'orbit',
      persist: true,
    });

    expect(enumSchema.safeParse('fly').success).toBe(true);
    expect(enumSchema.safeParse('walk').success).toBe(false);
  });

  it('uses only persisted section properties in generated section schemas', () => {
    const section: SectionDef = {
      key: 'example',
      storeHook: 'useUIStore',
      properties: [
        {
          key: 'visible',
          type: 'boolean',
          default: true,
          persist: true,
        },
        {
          key: 'runtimeOnly',
          type: 'boolean',
          default: false,
          persist: false,
          transient: true,
        },
      ] satisfies PropertyDef[],
    };

    const schema = generateSectionSchema(section);

    expect(schema.safeParse({ visible: true }).success).toBe(true);
    expect(schema.safeParse({ visible: 'yes' }).success).toBe(false);
    expect(schema.safeParse({ runtimeOnly: 'still ignored' }).success).toBe(true);
  });

  it('generates an app configuration schema that validates current section keys', () => {
    const schema = generateAppConfigurationSchema();

    expect(schema.safeParse({
      version: 1,
      pointCloud: {
        pointSize: 3,
        colorMode: 'trackLength',
      },
      camera: {
        mode: 'fly',
      },
    }).success).toBe(true);

    expect(schema.safeParse({
      version: 2,
    }).success).toBe(false);
  });

  it('applies shared hex color validation across persisted color sections', () => {
    const schema = generateAppConfigurationSchema();

    expect(schema.safeParse({
      camera: {
        frustumSingleColor: '#12aBef',
        selectionColor: '#00ff00',
      },
      ui: {
        backgroundColor: '#ffffff',
        matchesColor: '#ff00ff',
      },
      rig: {
        rigLineColor: '#00ffff',
      },
    }).success).toBe(true);

    expect(schema.safeParse({
      rig: {
        rigLineColor: '#fff',
      },
    }).success).toBe(false);
  });
});
