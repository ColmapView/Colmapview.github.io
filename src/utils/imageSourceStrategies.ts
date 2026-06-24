/**
 * Composition root for image-source resolution: assembles the ordered strategy
 * chain (add-ons first so their per-image overrides win, core heuristics last).
 *
 * Register new dataset conventions here — add-on modules export only their own
 * strategy and stay unaware of each other and of the core list.
 */

import { CORE_IMAGE_SOURCE_STRATEGIES, type ImageSourceStrategy } from './imageSourceResolution';
import { imageMappingCsvStrategy } from './imageMappingCsvResolver';

export const IMAGE_SOURCE_STRATEGIES: readonly ImageSourceStrategy[] = [
  imageMappingCsvStrategy,
  ...CORE_IMAGE_SOURCE_STRATEGIES,
];
