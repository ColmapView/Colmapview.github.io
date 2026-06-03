import { describe, expect, it } from 'vitest';
import {
  addConfigurationSection,
  createConfigurationFromSections,
  isConfigurationSectionKey,
  type ConfigurationSections,
} from './configurationRecord';

function buildSections(): ConfigurationSections {
  return {
    pointCloud: { showPointCloud: true },
    camera: { displayMode: 'frustum' },
    ui: { showAxes: true },
    export: { screenshotFormat: 'jpeg' },
    rig: { showRig: true },
  };
}

describe('configurationRecord', () => {
  it('recognizes typed configuration section keys', () => {
    expect(isConfigurationSectionKey('pointCloud')).toBe(true);
    expect(isConfigurationSectionKey('rig')).toBe(true);
    expect(isConfigurationSectionKey('unknown')).toBe(false);
  });

  it('adds only supported configuration sections', () => {
    const sections: ConfigurationSections = {};

    addConfigurationSection(sections, 'rig', { showRig: true });
    expect(sections.rig).toEqual({ showRig: true });

    expect(() => addConfigurationSection(sections, 'legacy', {})).toThrow(
      'Unsupported configuration section: legacy'
    );
  });

  it('assembles app configuration with version and all required sections', () => {
    const sections = buildSections();

    expect(createConfigurationFromSections(sections)).toEqual({
      version: 1,
      ...sections,
    });
  });

  it('fails when a required section was not supplied by the registry loop', () => {
    const sections = buildSections();
    delete sections.rig;

    expect(() => createConfigurationFromSections(sections)).toThrow(
      'Missing configuration section: rig'
    );
  });
});
