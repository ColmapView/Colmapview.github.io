import { describe, expect, it } from 'vitest';
import { camelToSnake, snakeToCamel } from './converter';
import { parseConfigYaml, serializeConfigToYaml } from './serializer';
import type { AppConfiguration } from './types';

const config: AppConfiguration = {
  version: 1,
  pointCloud: {
    showPointCloud: true,
    pointSize: 4,
    pointOpacity: 0.8,
    colorMode: 'splats',
    minTrackLength: 3,
    maxReprojectionError: null,
  },
  camera: {
    displayMode: 'frustum',
    scale: 0.25,
    frustumColorMode: 'single',
    unselectedOpacity: 0.35,
    mode: 'orbit',
    projection: 'perspective',
    fov: 60,
    horizonLock: 'off',
    autoRotateMode: 'off',
    autoRotateSpeed: 0.5,
    flySpeed: 1,
    pointerLock: false,
    selectionColorMode: 'static',
    selectionColor: '#ff00ff',
    selectionAnimationSpeed: 1,
    selectionPlaneOpacity: 0.35,
    autoFovEnabled: true,
  },
  ui: {
    showPoints2D: true,
    showPoints3D: true,
    backgroundColor: '#ffffff',
    matchesDisplayMode: 'static',
    matchesOpacity: 0.8,
    matchesColor: '#00ffff',
    maskOverlay: false,
    maskOpacity: 0.5,
    showAxes: true,
    showGrid: true,
    axesCoordinateSystem: 'opengl',
    axesScale: 1,
    gridScale: 1,
    axisLabelMode: 'xyz',
    showGizmo: true,
    galleryCollapsed: false,
  },
  export: {
    screenshotSize: 'viewport',
    screenshotFormat: 'jpeg',
    screenshotHideLogo: false,
    modelFormat: 'binary',
  },
  rig: {
    showRig: true,
    rigDisplayMode: 'static',
    rigColorMode: 'perFrame',
    rigLineColor: '#00ffff',
    rigLineOpacity: 0.8,
  },
};

describe('configuration serialization', () => {
  it('converts nested keys between camelCase and snake_case', () => {
    expect(camelToSnake({
      pointCloud: {
        pointSize: 4,
        maxReprojectionError: null,
      },
      listValues: [{ showGrid: true }],
      ignored: undefined,
    })).toEqual({
      point_cloud: {
        point_size: 4,
        max_reprojection_error: null,
      },
      list_values: [{ show_grid: true }],
      ignored: null,
    });

    expect(snakeToCamel({
      point_cloud: {
        point_size: 4,
        max_reprojection_error: null,
      },
      list_values: [{ show_grid: true }],
    })).toEqual({
      pointCloud: {
        pointSize: 4,
        maxReprojectionError: null,
      },
      listValues: [{ showGrid: true }],
    });
  });

  it('parses snake_case YAML into validated partial configuration', () => {
    const result = parseConfigYaml(`
version: 1
point_cloud:
  point_size: 5
  show_splats: true
  max_reprojection_error: null
camera:
  auto_rotate_mode: cw
`);

    expect(result).toEqual({
      valid: true,
      errors: [],
      config: {
        version: 1,
        pointCloud: {
          pointSize: 5,
          colorMode: 'splats',
          maxReprojectionError: null,
        },
        camera: {
          autoRotateMode: 'cw',
        },
      },
    });
  });

  it('rejects empty, scalar, and invalid YAML configuration content', () => {
    expect(parseConfigYaml('').errors[0]?.message).toBe('Empty configuration file');
    expect(parseConfigYaml('42').errors[0]?.message).toBe('Configuration must be an object');

    const invalid = parseConfigYaml(`
point_cloud:
  point_size: -1
`);

    expect(invalid.valid).toBe(false);
    expect(invalid.errors[0]).toMatchObject({
      path: 'pointCloud.pointSize',
    });
  });

  it('serializes configuration to YAML with snake_case keys', () => {
    const yaml = serializeConfigToYaml(config);

    expect(yaml).toContain('point_cloud:');
    expect(yaml).toContain('color_mode: splats');
    expect(yaml).toContain('point_size: 4');
    expect(yaml).toContain('auto_rotate_mode: "off"');
    expect(yaml).not.toContain('pointCloud:');
  });
});
