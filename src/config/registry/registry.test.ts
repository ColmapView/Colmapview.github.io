import { describe, it, expect } from 'vitest';
import { generateDefaultConfiguration } from './generators/defaults';
import { generateConfigTemplate } from './generators/template';
import { generatedAppConfigurationSchema } from './generators/schema';
import { sections, getPersistedProperties } from './index';

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
      expect(defaults.camera.mode).toBe('orbit');
      expect(defaults.camera.fov).toBe(60);
    });

    it('should generate correct UI defaults', () => {
      const defaults = generateDefaultConfiguration();
      expect(defaults.ui.backgroundColor).toBe('#ffffff');
      expect(defaults.ui.axesDisplayMode).toBe('both');
      expect(defaults.ui.imageLoadMode).toBe('lazy');
    });

    it('should generate correct export defaults', () => {
      const defaults = generateDefaultConfiguration();
      expect(defaults.export.screenshotFormat).toBe('jpeg');
      expect(defaults.export.modelFormat).toBe('binary');
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
  });
});
