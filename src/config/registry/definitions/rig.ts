/**
 * Rig Property Definitions
 */
import { defineSection } from '../types';
import { RIG_DISPLAY_MODES, RIG_COLOR_MODES } from '../../../store/types';
import { LINE_WIDTH } from '../../../theme/opacity';
import { CSS_HEX_COLOR_PATTERN, CSS_HEX_COLOR_PATTERN_DESCRIPTION } from '../../../utils/hexColor';

export const rigSection = defineSection({
  key: 'rig',
  storeHook: 'useRigStore' as const,
  properties: [
    {
      key: 'showRig',
      type: 'boolean',
      default: true,
      persist: true,
      description: 'Show rig connections',
    },
    {
      key: 'rigDisplayMode',
      type: 'enum',
      enumValues: RIG_DISPLAY_MODES,
      default: 'static',
      persist: true,
      description: 'static | blink',
    },
    {
      key: 'rigColorMode',
      type: 'enum',
      enumValues: RIG_COLOR_MODES,
      default: 'perFrame',
      persist: true,
      description: 'single | perFrame',
    },
    {
      key: 'rigLineColor',
      type: 'string',
      pattern: CSS_HEX_COLOR_PATTERN,
      patternDesc: CSS_HEX_COLOR_PATTERN_DESCRIPTION,
      default: '#00ffff',
      persist: true,
      description: 'Rig line color (hex)',
    },
    {
      key: 'rigLineOpacity',
      type: 'number',
      min: 0,
      max: 1,
      default: 0.7,
      persist: true,
      description: 'Rig line opacity (0-1)',
    },
    {
      key: 'rigLineWidth',
      type: 'number',
      min: 1,
      max: 6,
      default: LINE_WIDTH.rig,
      persist: true,
      description: 'Rig connection line width (1 - 6)',
    },
  ],
});
