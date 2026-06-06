import { describe, it, expect } from 'vitest';
import { generateDefaultConfiguration } from './generators/defaults';
import { generateConfigTemplate } from './generators/template';
import { generatedAppConfigurationSchema, generateSectionSchema } from './generators/schema';
import { getStoreConfigAdapter } from './generators/storeAdapters';
import { sections, getPersistedProperties, getStoreKey, pointCloudSection } from './index';
import type { PropertyDef } from './types';

function getStoreWritableDefault(prop: PropertyDef): unknown {
  if (prop.type === 'number' && prop.nullable && prop.default === null) {
    return Infinity;
  }

  return prop.default;
}

describe('Property Registry', () => {
  describe('Sections', () => {
    it('should have all required sections', () => {
      const sectionKeys = sections.map((s) => s.key);
      expect(sectionKeys).toContain('pointCloud');
      expect(sectionKeys).toContain('camera');
      expect(sectionKeys).toContain('ui');
      expect(sectionKeys).toContain('export');
    });
  });

  describe('Defaults Generator', () => {
    it('should generate defaults with correct structure', () => {
      const defaults = generateDefaultConfiguration();
      expect(defaults.version).toBe(1);
      expect(defaults.pointCloud).toBeDefined();
      expect(defaults.camera).toBeDefined();
      expect(defaults.ui).toBeDefined();
      expect(defaults.export).toBeDefined();
      expect(defaults.rig).toBeDefined();
    });

    it('should generate correct point cloud defaults', () => {
      const defaults = generateDefaultConfiguration();
      expect(defaults.pointCloud.pointSize).toBe(2);
      expect(defaults.pointCloud.colorMode).toBe('rgb');
      expect(defaults.pointCloud.minTrackLength).toBe(2);
      expect(defaults.pointCloud.maxReprojectionError).toBe(null);
    });

    it('should generate correct camera defaults', () => {
      const defaults = generateDefaultConfiguration();
      expect(defaults.camera.displayMode).toBe('frustum');
      expect(defaults.camera.scale).toBe(0.25);
      expect(defaults.camera.frustumLineWidth).toBe(1);
      expect(defaults.camera.mode).toBe('orbit');
      expect(defaults.camera.fov).toBe(60);
    });

    it('should generate correct UI defaults', () => {
      const defaults = generateDefaultConfiguration();
      expect(defaults.ui.backgroundColor).toBe('#ffffff');
      expect(defaults.ui.matchesLineWidth).toBe(1);
      expect(defaults.ui.showAxes).toBe(true);
      expect(defaults.ui.showGrid).toBe(true);
    });

    it('should generate correct export defaults', () => {
      const defaults = generateDefaultConfiguration();
      expect(defaults.export.screenshotFormat).toBe('jpeg');
      expect(defaults.export.modelFormat).toBe('binary');
    });

    it('should generate correct rig defaults', () => {
      const defaults = generateDefaultConfiguration();
      expect(defaults.rig.showRig).toBe(true);
      expect(defaults.rig.rigDisplayMode).toBe('static');
      expect(defaults.rig.rigColorMode).toBe('perFrame');
      expect(defaults.rig.rigLineColor).toBe('#00ffff');
      expect(defaults.rig.rigLineWidth).toBe(1);
    });
  });

  describe('Schema Generator', () => {
    it('should validate correct configuration', () => {
      const defaults = generateDefaultConfiguration();
      const result = generatedAppConfigurationSchema.safeParse(defaults);
      expect(result.success).toBe(true);
    });

    it('should reject invalid values', () => {
      const invalid = {
        pointCloud: {
          pointSize: -1, // Below min
        },
      };
      const result = generatedAppConfigurationSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should accept partial configuration', () => {
      const partial = {
        pointCloud: {
          pointSize: 5,
        },
      };
      const result = generatedAppConfigurationSchema.safeParse(partial);
      expect(result.success).toBe(true);
    });

    it('should make generated sections optional while validating present values', () => {
      const schema = generateSectionSchema(pointCloudSection);

      expect(schema.safeParse(undefined).success).toBe(true);
      expect(schema.safeParse({ pointSize: 5 }).success).toBe(true);
      expect(schema.safeParse({ pointSize: -1 }).success).toBe(false);
    });
  });

  describe('Template Generator', () => {
    it('should generate valid YAML template', () => {
      const template = generateConfigTemplate();
      expect(template).toContain('version: 1');
      expect(template).toContain('point_cloud:');
      expect(template).toContain('camera:');
      expect(template).toContain('ui:');
      expect(template).toContain('export:');
    });

    it('should use snake_case for YAML keys', () => {
      const template = generateConfigTemplate();
      expect(template).toContain('point_size:');
      expect(template).toContain('color_mode:');
      expect(template).toContain('display_mode:');
    });

    it('should include comments', () => {
      const template = generateConfigTemplate();
      expect(template).toContain('#');
    });
  });

  describe('Persisted Properties', () => {
    it('should correctly identify persisted properties', () => {
      for (const section of sections) {
        const persisted = getPersistedProperties(section);
        for (const prop of persisted) {
          expect(prop.persist).toBe(true);
          expect(prop.transient).not.toBe(true);
        }
      }
    });

    it('should have store adapter read/write coverage for every persisted property', () => {
      for (const section of sections) {
        const adapter = getStoreConfigAdapter(section.storeHook);

        for (const prop of getPersistedProperties(section)) {
          const storeKey = getStoreKey(prop);
          const value = getStoreWritableDefault(prop);

          expect(() => adapter.write(storeKey, value), `${section.key}.${prop.key} write`).not.toThrow();
          expect(() => adapter.read(storeKey), `${section.key}.${prop.key} read`).not.toThrow();
        }
      }
    });
  });
});
