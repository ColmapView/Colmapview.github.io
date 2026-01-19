/**
 * UI Property Definitions
 */
import { defineSection } from '../types';
import {
  MATCHES_DISPLAY_MODES,
  AXES_DISPLAY_MODES,
  AXES_COORDINATE_SYSTEMS,
  AXIS_LABEL_MODES,
  IMAGE_LOAD_MODES,
  GIZMO_MODES,
} from '../../../store/types';

export const uiSection = defineSection({
  key: 'ui',
  storeHook: 'useUIStore',
  properties: [
    // Point visualization
    {
      key: 'showPoints2D',
      type: 'boolean',
      default: false,
      persist: true,
    },
    {
      key: 'showPoints3D',
      type: 'boolean',
      default: false,
      persist: true,
    },
    // Scene display
    {
      key: 'backgroundColor',
      type: 'string',
      pattern: /^#[0-9A-Fa-f]{6}$/,
      patternDesc: 'hex color (#RRGGBB)',
      default: '#ffffff',
      persist: true,
    },
    // Match visualization
    {
      key: 'matchesDisplayMode',
      type: 'enum',
      enumValues: MATCHES_DISPLAY_MODES,
      default: 'off',
      persist: true,
      description: 'off | on | blink',
    },
    {
      key: 'matchesOpacity',
      type: 'number',
      min: 0,
      max: 1,
      default: 0.75,
      persist: true,
    },
    {
      key: 'matchesColor',
      type: 'string',
      pattern: /^#[0-9A-Fa-f]{6}$/,
      patternDesc: 'hex color (#RRGGBB)',
      default: '#ff00ff',
      persist: true,
      description: 'Hex color for matches visualization',
    },
    // Mask overlay
    {
      key: 'maskOverlay',
      storeKey: 'showMaskOverlay',
      type: 'boolean',
      default: false,
      persist: true,
    },
    {
      key: 'maskOpacity',
      type: 'number',
      min: 0,
      max: 1,
      default: 0.7,
      persist: true,
    },
    // Axes and grid
    {
      key: 'axesDisplayMode',
      type: 'enum',
      enumValues: AXES_DISPLAY_MODES,
      default: 'both',
      persist: true,
      description: 'off | axes | grid | both',
    },
    {
      key: 'axesCoordinateSystem',
      type: 'enum',
      enumValues: AXES_COORDINATE_SYSTEMS,
      default: 'colmap',
      persist: true,
      description: 'colmap | opencv | threejs | opengl | vulkan | blender | houdini | unity | unreal',
    },
    {
      key: 'axesScale',
      type: 'number',
      min: 0.1,
      max: 100,
      default: 1,
      persist: true,
    },
    {
      key: 'gridScale',
      type: 'number',
      min: 0.1,
      max: 100,
      default: 1,
      persist: true,
      description: 'Grid size multiplier (0.1 - 100)',
    },
    {
      key: 'axisLabelMode',
      type: 'enum',
      enumValues: AXIS_LABEL_MODES,
      default: 'extra',
      persist: true,
      description: 'off | xyz | extra',
    },
    // Image loading
    {
      key: 'imageLoadMode',
      type: 'enum',
      enumValues: IMAGE_LOAD_MODES,
      default: 'lazy',
      persist: true,
      description: 'prefetch | lazy | skip',
    },
    // Memory optimization
    {
      key: 'liteParserThresholdMB',
      type: 'number',
      min: 0,
      isInt: true,
      default: 1000,
      persist: true,
      description: 'Skip loading 2D points for images.bin larger than this (MB). 0 = always load full data.',
    },
    // Gizmo
    {
      key: 'gizmoMode',
      type: 'enum',
      enumValues: GIZMO_MODES,
      default: 'off',
      persist: true,
      description: 'off | local | global',
    },
    // Layout
    {
      key: 'galleryCollapsed',
      type: 'boolean',
      default: false,
      persist: true,
      description: 'Start with gallery panel collapsed',
    },
    // Transient properties (not persisted)
    {
      key: 'imageDetailId',
      type: 'number',
      default: 0,
      persist: false,
      transient: true,
    },
    {
      key: 'showMatchesInModal',
      type: 'boolean',
      default: false,
      persist: false,
      transient: true,
    },
    {
      key: 'matchedImageId',
      type: 'number',
      default: 0,
      persist: false,
      transient: true,
    },
    {
      key: 'viewResetTrigger',
      type: 'number',
      default: 0,
      persist: false,
      transient: true,
    },
    {
      key: 'viewDirection',
      type: 'string',
      default: '',
      persist: false,
      transient: true,
    },
    {
      key: 'viewTrigger',
      type: 'number',
      default: 0,
      persist: false,
      transient: true,
    },
  ],
});
