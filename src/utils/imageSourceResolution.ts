/**
 * Pluggable resolution of where a reconstruction's images live.
 *
 * Core strategies cover the general cases (an `images/` folder, nested per-camera
 * dirs, or any folder holding the images). Special dataset conventions are added
 * as higher-priority add-on strategies (see imageMappingCsvResolver) without the
 * core needing to know about them.
 *
 * Composition is override + fallback (NOT first-claim-wins): the resolved result
 * carries BOTH an optional per-image override map (from the first add-on that has
 * one) AND an optional base directory (from the first core strategy that finds
 * one). A consumer resolves each image as `imageNameToPath[name] ?? imagesDir/name`,
 * so a partial override map still falls back to the base directory.
 */

import { resolveImagesDir } from './colmapPathResolver';
import { appLogger } from './logger';

/** A single strategy's contribution to image resolution. */
export type ImageSourceContribution =
  /** A base directory; the image name is appended to it. `''` = dataset root. */
  | { kind: 'base-dir'; imagesDir: string }
  /** Explicit per-image paths (relative to the dataset root). */
  | { kind: 'per-image'; imageNameToPath: Record<string, string> };

/**
 * The merged resolution. Both fields may be present: per-image overrides take
 * precedence, with the base directory as the fallback for unmapped names.
 */
export interface ResolvedImageLocation {
  /** Base images directory relative to the dataset root (`''` = root). */
  imagesDir?: string;
  /** Per-image overrides: COLMAP image name -> path relative to the dataset root. */
  imageNameToPath?: Record<string, string>;
}

export interface ImageResolveContext {
  /** Every file path in the dataset, relative to the dataset root. */
  filePaths: readonly string[];
  /** The resolved COLMAP model directory (used to prefer a nearby images dir). */
  modelDir: string;
  /** Fetch a dataset-relative text file (used by add-ons, e.g. a mapping CSV). */
  fetchText?: (relativePath: string) => Promise<string | null>;
}

export interface ImageSourceStrategy {
  readonly id: string;
  /** Return a contribution, or null to defer to the next strategy. */
  resolve(
    ctx: ImageResolveContext
  ): Promise<ImageSourceContribution | null> | ImageSourceContribution | null;
}

/**
 * Core strategy: canonical images-directory resolution. Handles an `images/`
 * folder (possibly nested per camera) and falls back to the folder holding the
 * most images, so images in a non-`images` folder still resolve. `''` (dataset
 * root) is a valid result.
 */
export const imagesDirStrategy: ImageSourceStrategy = {
  id: 'images-dir',
  resolve(ctx) {
    const dir = resolveImagesDir(ctx.filePaths, { modelDir: ctx.modelDir });
    return dir === null ? null : { kind: 'base-dir', imagesDir: dir };
  },
};

/** Core strategies, lowest priority (general heuristics). */
export const CORE_IMAGE_SOURCE_STRATEGIES: readonly ImageSourceStrategy[] = [imagesDirStrategy];

/**
 * Run the strategy chain and merge contributions: the first non-empty per-image
 * map (overrides) and the first base directory (fallback). A throwing strategy is
 * logged and treated as a decline so it can't suppress later strategies. Returns
 * null when nothing resolves.
 */
export async function resolveImageSource(
  ctx: ImageResolveContext,
  strategies: readonly ImageSourceStrategy[]
): Promise<ResolvedImageLocation | null> {
  let imagesDir: string | undefined;
  let imageNameToPath: Record<string, string> | undefined;

  for (const strategy of strategies) {
    let contribution: ImageSourceContribution | null = null;
    try {
      contribution = await strategy.resolve(ctx);
    } catch (err) {
      appLogger.warn(`[Image resolve] strategy "${strategy.id}" failed:`, err);
      continue;
    }
    if (!contribution) {
      continue;
    }
    if (
      contribution.kind === 'per-image'
      && imageNameToPath === undefined
      && Object.keys(contribution.imageNameToPath).length > 0
    ) {
      imageNameToPath = contribution.imageNameToPath;
    } else if (contribution.kind === 'base-dir' && imagesDir === undefined) {
      imagesDir = contribution.imagesDir; // '' (root) is valid and intentional
    }
  }

  if (imagesDir === undefined && imageNameToPath === undefined) {
    return null;
  }
  return {
    ...(imagesDir !== undefined ? { imagesDir } : {}),
    ...(imageNameToPath !== undefined ? { imageNameToPath } : {}),
  };
}
