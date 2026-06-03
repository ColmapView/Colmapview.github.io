import { describe, expect, it } from 'vitest';
import { CameraModelId } from '../types/colmap';
import { getDefaultConfiguration } from '../config/configuration';
import { STORAGE_KEYS } from '../store/migration';
import { DEFAULT_PROFILE_NAME, DEFAULT_PROFILES_DATA } from '../store/profileTypes';
import {
  loadProfilesData,
  normalizeProfilesData,
  parseProfilesDataJson,
  saveProfilesData,
  serializeProfilesData,
} from './profilesStorage';

describe('profilesStorage', () => {
  it('returns defaults for missing, malformed, or non-object profile payloads', () => {
    expect(parseProfilesDataJson(null)).toBe(DEFAULT_PROFILES_DATA);
    expect(parseProfilesDataJson('{not json')).toBe(DEFAULT_PROFILES_DATA);
    expect(normalizeProfilesData(null)).toBe(DEFAULT_PROFILES_DATA);
    expect(normalizeProfilesData({ profiles: null })).toBe(DEFAULT_PROFILES_DATA);
  });

  it('keeps valid profiles and drops invalid profile configs', () => {
    const config = getDefaultConfiguration();
    const result = normalizeProfilesData({
      profiles: {
        Dense: config,
        Invalid: { pointCloud: { pointSize: -1 } },
      },
      activeProfile: 'Dense',
    });

    expect(result).toEqual({
      profiles: { Dense: config },
      activeProfile: 'Dense',
    });
  });

  it('normalizes active profile names to existing profiles, default, or null', () => {
    const config = getDefaultConfiguration();

    expect(normalizeProfilesData({
      profiles: { Dense: config },
      activeProfile: DEFAULT_PROFILE_NAME,
    }).activeProfile).toBe(DEFAULT_PROFILE_NAME);
    expect(normalizeProfilesData({
      profiles: { Dense: config },
      activeProfile: 'Missing',
    }).activeProfile).toBeNull();
    expect(normalizeProfilesData({
      profiles: { Dense: config },
      activeProfile: 12,
    }).activeProfile).toBeNull();
  });

  it('serializes user profiles without persisting the computed default profile', () => {
    const config = getDefaultConfiguration();
    const serialized = serializeProfilesData({
      profiles: {
        [DEFAULT_PROFILE_NAME]: config,
        Dense: {
          camera: {
            displayMode: 'frustum',
            scale: 2,
            mode: 'orbit',
            projection: 'perspective',
            fov: 50,
            horizonLock: 'off',
            autoRotateMode: 'off',
            autoRotateSpeed: 1,
            flySpeed: 1,
            pointerLock: false,
            frustumColorMode: 'single',
            unselectedOpacity: 0.2,
            selectionColorMode: 'static',
            selectionColor: '#ffffff',
            selectionAnimationSpeed: 1,
            selectionPlaneOpacity: 0.5,
            autoFovEnabled: false,
          },
        },
      },
      activeProfile: 'Dense',
    });

    expect(JSON.parse(serialized)).toEqual({
      profiles: {
        Dense: {
          camera: {
            displayMode: 'frustum',
            scale: 2,
            mode: 'orbit',
            projection: 'perspective',
            fov: 50,
            horizonLock: 'off',
            autoRotateMode: 'off',
            autoRotateSpeed: 1,
            flySpeed: 1,
            pointerLock: false,
            frustumColorMode: 'single',
            unselectedOpacity: 0.2,
            selectionColorMode: 'static',
            selectionColor: '#ffffff',
            selectionAnimationSpeed: 1,
            selectionPlaneOpacity: 0.5,
            autoFovEnabled: false,
          },
        },
      },
      activeProfile: 'Dense',
    });
  });

  it('loads and saves through the provided storage adapter', () => {
    const storage = createStorage();
    const config = getDefaultConfiguration();
    config.camera.displayMode = 'imageplane';
    config.camera.projection = 'orthographic';
    config.camera.fov = 65;
    config.pointCloud.colorMode = 'rgb';
    config.camera.selectionColorMode = 'static';
    config.camera.autoRotateMode = 'off';
    config.camera.mode = 'orbit';
    config.camera.frustumColorMode = 'single';
    config.camera.horizonLock = 'off';
    config.export.screenshotFormat = 'png';
    config.export.modelFormat = 'text';
    config.rig.rigDisplayMode = 'static';
    config.rig.rigColorMode = 'single';
    config.ui.matchesDisplayMode = 'static';
    config.ui.axisLabelMode = 'off';
    config.ui.axesCoordinateSystem = 'colmap';

    saveProfilesData({ profiles: { Dense: config }, activeProfile: 'Dense' }, storage);

    expect(storage.getItem(STORAGE_KEYS.profiles)).toBe(serializeProfilesData({
      profiles: { Dense: config },
      activeProfile: 'Dense',
    }));
    expect(loadProfilesData(storage)).toEqual({
      profiles: { Dense: config },
      activeProfile: 'Dense',
    });
  });

  it('accepts partial profile configurations because applyConfigurationToStores accepts partials', () => {
    expect(normalizeProfilesData({
      profiles: {
        Minimal: {
          camera: {
            displayMode: 'frustum',
            scale: 1,
            mode: 'orbit',
            projection: 'perspective',
            fov: 50,
            horizonLock: 'off',
            autoRotateMode: 'off',
            autoRotateSpeed: 1,
            flySpeed: 1,
            pointerLock: false,
            frustumColorMode: 'single',
            unselectedOpacity: 0.2,
            selectionColorMode: 'static',
            selectionColor: '#ffffff',
            selectionAnimationSpeed: 1,
            selectionPlaneOpacity: 0.5,
            autoFovEnabled: false,
          },
          pointCloud: { colorMode: 'trackLength' },
        },
      },
      activeProfile: 'Minimal',
    }).profiles.Minimal?.pointCloud?.colorMode).toBe('trackLength');

    expect(normalizeProfilesData({
      profiles: {
        LegacySplats: {
          pointCloud: { showSplats: true },
        },
      },
      activeProfile: 'LegacySplats',
    }).profiles.LegacySplats?.pointCloud?.colorMode).toBe('splats');
  });

  it('rejects unsupported enum values in stored profile configs', () => {
    expect(normalizeProfilesData({
      profiles: {
        BadCamera: {
          camera: { displayMode: 'not-a-camera-mode' },
          pointCloud: { colorMode: CameraModelId.PINHOLE },
        },
      },
      activeProfile: 'BadCamera',
    })).toEqual({ profiles: {}, activeProfile: null });
  });
});

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
