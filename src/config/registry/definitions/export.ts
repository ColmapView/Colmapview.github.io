/**
 * Export Property Definitions
 */
import { defineSection } from '../types';
import { SCREENSHOT_SIZES, SCREENSHOT_FORMATS } from '../../../store/types';

// Model export formats (excluding 'config' which is a special action)
const MODEL_EXPORT_FORMATS = ['text', 'binary', 'ply', 'zip'] as const;

export const exportSection = defineSection({
  key: 'export',
  storeHook: 'useExportStore',
  properties: [
    {
      key: 'screenshotSize',
      type: 'enum',
      enumValues: SCREENSHOT_SIZES,
      default: 'current',
      persist: true,
      description: 'current | 1920x1080 | 1280x720 | 3840x2160 | 1024x1024 | 512x512 | 2048x2048',
    },
    {
      key: 'screenshotFormat',
      type: 'enum',
      enumValues: SCREENSHOT_FORMATS,
      default: 'jpeg',
      persist: true,
      description: 'jpeg | png | webp',
    },
    {
      key: 'screenshotHideLogo',
      type: 'boolean',
      default: false,
      persist: true,
    },
    {
      key: 'modelFormat',
      storeKey: 'exportFormat',
      type: 'enum',
      enumValues: MODEL_EXPORT_FORMATS,
      default: 'binary',
      persist: true,
      description: 'text | binary | ply | zip',
    },
    // Transient properties (not persisted)
    {
      key: 'screenshotTrigger',
      type: 'number',
      default: 0,
      persist: false,
      transient: true,
    },
    {
      key: 'exportTrigger',
      type: 'number',
      default: 0,
      persist: false,
      transient: true,
    },
  ],
});
