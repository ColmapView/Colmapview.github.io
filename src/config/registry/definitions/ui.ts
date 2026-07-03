/**
 * UI Property Definitions
 */
import { defineSection } from '../types';
import {
  MATCHES_DISPLAY_MODES,
  AXES_COORDINATE_SYSTEMS,
  AXIS_LABEL_MODES,
} from '../../../store/types';
import {
  DEFAULT_GALLERY_COLUMNS,
  GALLERY_BORDER_COLOR_MODE_SETTINGS,
  GALLERY_SORT_DIRECTIONS,
  GALLERY_SORT_FIELDS,
  GALLERY_THUMBNAIL_DISPLAY_MODES,
  GALLERY_VIEW_MODE_SETTINGS,
} from '../../../types/gallery';
import { OPACITY } from '../../../theme/opacity';
import { LINE_WIDTH } from '../../../theme/opacity';
import { VIZ_COLORS } from '../../../theme/colors';
import { CSS_HEX_COLOR_PATTERN, CSS_HEX_COLOR_PATTERN_DESCRIPTION } from '../../../utils/hexColor';

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
      pattern: CSS_HEX_COLOR_PATTERN,
      patternDesc: CSS_HEX_COLOR_PATTERN_DESCRIPTION,
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
      default: 'static',
      persist: true,
      description: 'static | blink',
    },
    {
      key: 'matchesOpacity',
      type: 'number',
      min: 0,
      max: 1,
      default: OPACITY.matchLines,
      persist: true,
    },
    {
      key: 'matchesColor',
      type: 'string',
      pattern: CSS_HEX_COLOR_PATTERN,
      patternDesc: CSS_HEX_COLOR_PATTERN_DESCRIPTION,
      default: VIZ_COLORS.match,
      persist: true,
      description: 'Hex color for matches visualization',
    },
    {
      key: 'matchesLineWidth',
      type: 'number',
      min: 1,
      max: 6,
      default: LINE_WIDTH.match,
      persist: true,
      description: 'Match line width (1 - 6)',
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
      // Default off: a fresh load shows only the grid. Mirrored by the uiStore initial
      // state and the persisted-store migration fallback.
      type: 'boolean',
      default: false,
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
    {
      key: 'galleryViewMode',
      type: 'enum',
      enumValues: GALLERY_VIEW_MODE_SETTINGS,
      default: 'auto',
      persist: true,
      description: 'auto | gallery | list',
    },
    {
      key: 'galleryColumns',
      type: 'number',
      min: 1,
      max: 10,
      isInt: true,
      default: DEFAULT_GALLERY_COLUMNS,
      persist: true,
      description: 'Gallery grid columns (1 - 10)',
    },
    {
      key: 'galleryCameraFilter',
      type: 'string',
      default: 'all',
      persist: true,
      description: 'all or camera id',
    },
    {
      key: 'gallerySortField',
      type: 'enum',
      enumValues: GALLERY_SORT_FIELDS,
      default: 'name',
      persist: true,
      description: 'name | imageId | avgError | covisibleCount | numPoints3D | numPoints2D | splatPsnr | splatSsim',
    },
    {
      key: 'gallerySortDirection',
      type: 'enum',
      enumValues: GALLERY_SORT_DIRECTIONS,
      default: 'asc',
      persist: true,
      description: 'asc | desc',
    },
    {
      key: 'galleryBorderColorMode',
      type: 'enum',
      enumValues: GALLERY_BORDER_COLOR_MODE_SETTINGS,
      default: 'auto',
      persist: true,
      description: 'auto | none | camera | psnr | ssim',
    },
    {
      key: 'galleryThumbnailDisplayMode',
      type: 'enum',
      enumValues: GALLERY_THUMBNAIL_DISPLAY_MODES,
      default: 'image',
      persist: true,
      description: 'image | maskedImage | inverseMaskedImage | mask | hoverMask',
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
