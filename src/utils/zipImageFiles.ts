import {
  hasActiveZipArchive, findZipEntry, extractZipImage, getActiveZipImageIndex, clearActiveZipArchive,
} from './zipLoader';
import { appLogger } from './logger';
import { getMaskPathVariants } from './imageFileLookupPolicy';
import { getMaxCacheDimensions } from './imageFileCompression';
import { createImageFileRequestState } from './imageFileRequestState';
import type { DatasetAccessOptions } from '../dataset/types';
import type { ArchiveEntry } from '../archive/types';
import { createUrlFileCache } from '../dataset/urlFileCache';

// Images and masks share the existing byte-budget LRU policy; raw originals are never retained here.
const archiveFiles = createUrlFileCache();
const zipImageState = createImageFileRequestState(archiveFiles.scope('display'));
const zipMaskState = createImageFileRequestState(archiveFiles.scope('mask'));
const zipRawState = createImageFileRequestState();

export function getZipImageCached(name: string): File | undefined { return zipImageState.getCached(name); }
export function getZipMaskCached(name: string): File | undefined { return zipMaskState.getCached(name); }
export function isZipLoadingAvailable(): boolean { return hasActiveZipArchive(); }

export async function fetchZipImage(name: string, options?: DatasetAccessOptions): Promise<File | null> {
  if (!hasActiveZipArchive()) return null;
  return zipImageState.request(name, async context => {
    const file = await extractZipImage(name, {
      signal: context.signal, getPriority: context.getPriority, bounds: getMaxCacheDimensions(),
    });
    return context.isCurrent() ? file : null;
  }, options);
}

export async function fetchZipImageRaw(name: string, options?: DatasetAccessOptions): Promise<File | null> {
  if (!hasActiveZipArchive()) return null;
  return zipRawState.request(name, async context => extractZipImage(name, {
    signal: context.signal, getPriority: context.getPriority,
  }), options, false);
}

/** One line per archive, not per mask: a masked archive can hold thousands of masks. */
const summarisedMaskIndexes = new WeakSet<Map<string, ArchiveEntry>>();
function summariseZipMasks(imageIndex: Map<string, ArchiveEntry>): void {
  if (summarisedMaskIndexes.has(imageIndex)) return;
  summarisedMaskIndexes.add(imageIndex);
  // Each file is indexed under several path suffixes; only the one starting at masks/ is a mask lookup key.
  let count = 0;
  for (const key of imageIndex.keys()) if (/^masks\//i.test(key)) count++;
  if (count) appLogger.info(`[ZIP Mask] Found ${count} mask${count === 1 ? '' : 's'}`);
}

export async function fetchZipMask(name: string, options?: DatasetAccessOptions): Promise<File | null> {
  if (!hasActiveZipArchive()) return null;
  const cached = options?.signal?.aborted ? undefined : zipMaskState.getCached(name);
  if (cached) return cached;
  const imageIndex = getActiveZipImageIndex();
  if (!imageIndex) return null;
  summariseZipMasks(imageIndex);
  return zipMaskState.request(name, async context => {
    let extractionFailed = false;
    for (const path of getMaskPathVariants(name)) {
      if (!context.isCurrent()) return null;
      const entry = findZipEntry(path, imageIndex);
      if (entry) {
        try {
          const file = await entry.extract({ signal: context.signal, getPriority: context.getPriority });
          if (!context.isCurrent()) return null;
          return file;
        } catch { extractionFailed = true; /* Try the next candidate. */ }
      }
    }
    if (extractionFailed && context.isCurrent()) options?.onError?.({ kind: 'network', message: `Could not extract mask for ${name}` });
    return null;
  }, options);
}

export function removeZipMaskCacheEntries(names: string[]): void {
  for (const name of names) zipMaskState.deleteCached(name);
}
export function clearZipCache(): void {
  zipImageState.clear();
  zipMaskState.clear();
  zipRawState.clear();
  clearActiveZipArchive();
}
export function getZipImageCacheStats() { return zipImageState.getStats(); }
export function getZipMaskCacheStats() { return zipMaskState.getStats(); }

export function getZipImageGeneration() { return zipImageState.getGeneration(); }
