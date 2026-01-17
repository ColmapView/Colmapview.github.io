import * as YAML from 'js-yaml';
import { camelToSnake, snakeToCamel } from './converter';
import { validateConfiguration } from './schema';
import type { AppConfiguration, PartialAppConfiguration, ConfigValidationResult } from './types';

export function parseConfigYaml(yamlString: string): ConfigValidationResult {
  try {
    const parsed = YAML.load(yamlString);

    if (parsed === null || parsed === undefined) {
      return {
        valid: false,
        errors: [{ path: '', message: 'Empty configuration file' }],
        config: null,
      };
    }

    if (typeof parsed !== 'object') {
      return {
        valid: false,
        errors: [{ path: '', message: 'Configuration must be an object' }],
        config: null,
      };
    }

    // Convert snake_case keys to camelCase
    const camelCased = snakeToCamel(parsed) as PartialAppConfiguration;

    // Validate the configuration
    return validateConfiguration(camelCased);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown YAML parse error';
    return {
      valid: false,
      errors: [{ path: '', message: `YAML parse error: ${message}` }],
      config: null,
    };
  }
}

export function serializeConfigToYaml(config: AppConfiguration): string {
  // Convert camelCase to snake_case for YAML output
  const snakeCased = camelToSnake(config);

  return YAML.dump(snakeCased, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
  });
}

export function generateConfigTemplate(): string {
  return `# ColmapView Configuration
# All fields are optional - only include settings you want to customize.

version: 1

# Point cloud visualization
point_cloud:
  point_size: 2           # Range: 0.1 - 50
  color_mode: rgb         # rgb | error | trackLength
  min_track_length: 2     # Minimum observations for a point
  max_reprojection_error: ~  # null = show all points

# Camera frustum display
camera:
  display_mode: frustum   # off | frustum | arrow | imageplane
  scale: 0.25             # Frustum size multiplier (0.01 - 10)
  frustum_color_mode: byCamera  # single | byCamera
  unselected_opacity: 0.5
  mode: orbit             # orbit | fly
  projection: perspective # perspective | orthographic
  fov: 60                 # Field of view (10 - 120)
  horizon_lock: false
  fly_speed: 2.5          # Flying speed (0.1 - 50)
  pointer_lock: true
  selection_color_mode: rainbow  # off | static | blink | rainbow
  selection_animation_speed: 2
  image_plane_opacity: 0.9

# UI settings
ui:
  show_points_2d: false
  show_points_3d: false
  background_color: "#ffffff"
  auto_rotate: false
  matches_display_mode: off  # off | on | blink
  matches_opacity: 0.75
  mask_overlay: false
  mask_opacity: 0.7
  axes_display_mode: both    # off | axes | grid | both
  axes_coordinate_system: colmap  # colmap | opencv | threejs | opengl | vulkan | blender | houdini | unity | unreal
  axes_scale: 1
  image_load_mode: lazy      # prefetch | lazy | skip
  gizmo_mode: off            # off | local | global

# Export settings
export:
  screenshot_size: current   # current | 1920x1080 | 1280x720 | 3840x2160 | 1024x1024 | 512x512 | 2048x2048
  screenshot_format: jpeg    # jpeg | png | webp
  screenshot_hide_logo: false
  model_format: binary       # text | binary | ply
`;
}
