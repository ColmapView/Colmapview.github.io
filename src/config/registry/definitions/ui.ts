/**
 * UI Property Definitions
 */
import { defineSection } from '../types';
import {
  MATCHES_DISPLAY_MODES,
  AXES_COORDINATE_SYSTEMS,
  AXIS_LABEL_MODES,
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
      key: 'showMatches',
      type: 'boolean',
      default: false,
      persist: true,
      description: 'Show/hide match lines',
    },
    {
      key: 'matchesDisplayMode',
      type: 'enum',
      enumValues: MATCHES_DISPLAY_MODES,
      default: 'on',
      persist: true,
      description: 'on | blink',
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
      key: 'showAxes',
      type: 'boolean',
      default: true,
      persist: true,
      description: 'Show origin axes',
    },
    {
      key: 'showGrid',
      type: 'boolean',
      default: true,
      persist: true,
      description: 'Show grid plane',
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
    // Gizmo
    {
      key: 'showGizmo',
      type: 'boolean',
      default: false,
      persist: true,
      description: 'Show transform gizmo',
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
