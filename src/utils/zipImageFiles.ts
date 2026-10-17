import {
  hasActiveZipArchive, findZipEntry, extractZipImage, getActiveZipImageIndex, clearActiveZipArchive,
} from './zipLoader';
import { appLogger } from './logger';
import { getMaskPathVariants } from './imageFileLookupPolicy';
import { getMaxCacheDimensions, compressAndResizeToJpeg } from './imageFileCompression';
import { createImageFileRequestState } from './imageFileRequestState';
import type { DatasetAccessOptions } from '../dataset/types';
import type { ArchiveEntry } from '../archive/types';
import { createUrlFileCache } from '../dataset/urlFileCache';

// Images and masks share the existing byte-budget LRU policy; raw originals are never retained here.
const archiveFiles = createUrlFileCache();
const zipImageState = createImageFileRequestState(archiveFiles.scope('display'));
const zipMaskState = createImageFileRequestState(archiveFiles.scope('mask'));
const zipRawState = createImageFileRequestState();
const entryIds = new WeakMap<ArchiveEntry,number>();
const exactMaskKeys = new Map<string,Set<string>>();
let nextEntryId = 1;
function sourceKey(name: string, entry?: ArchiveEntry): string {
  if (!entry) return name;
  let id=entryIds.get(entry);
  if (id===undefined) {id=nextEntryId++;entryIds.set(entry,id);}
  return JSON.stringify(['entry',id,name]);
}

export function getZipImageCached(name: string, entry?: ArchiveEntry): File | undefined { return zipImageState.getCached(sourceKey(name,entry)); }
export function getZipMaskCached(name: string, entry?: ArchiveEntry): File | undefined { return zipMaskState.getCached(sourceKey(name,entry)); }
export function isZipLoadingAvailable(): boolean { return hasActiveZipArchive(); }

export async function fetchZipImage(name: string, options?: DatasetAccessOptions, exactEntry?: ArchiveEntry,
  validateOriginal?: (file: Blob, signal: AbortSignal) => Promise<void>): Promise<File | null> {
  if (!hasActiveZipArchive()) return null;
  if (exactEntry && exactEntry.size > (options?.maxBytes ?? 64 * 1024 * 1024)) throw new Error(`${name} exceeds its read budget.`);
  return zipImageState.request(sourceKey(name,exactEntry), async context => {
    if (exactEntry) {
      if (exactEntry.size > (options?.maxBytes ?? 64 * 1024 * 1024)) throw new Error(`${name} exceeds its read budget.`);
      const original = await exactEntry.extract({ signal: context.signal, getPriority: context.getPriority });
      await validateOriginal?.(original, context.signal);
      return context.isCurrent() ? compressAndResizeToJpeg(original, original.name) : null;
    }
    const file = await extractZipImage(name, {
      signal: context.signal, getPriority: context.getPriority, bounds: getMaxCacheDimensions(),
    });
    return context.isCurrent() ? file : null;
  }, options);
}

export async function fetchZipImageRaw(name: string, options?: DatasetAccessOptions, exactEntry?: ArchiveEntry): Promise<File | null> {
  if (!hasActiveZipArchive()) return null;
  const entry = exactEntry ?? findZipEntry(name, getActiveZipImageIndex() ?? new Map());
  if (entry && options?.maxBytes !== undefined && entry.size > options.maxBytes) throw new Error(`${name} exceeds its read budget.`);
  return zipRawState.request(JSON.stringify([sourceKey(name,exactEntry),options?.maxBytes ?? null]), async context => exactEntry ? exactEntry.extract({ signal: context.signal, getPriority: context.getPriority }) : extractZipImage(name, {
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

export async function fetchZipMask(name: string, options?: DatasetAccessOptions, exactEntry?: ArchiveEntry): Promise<File | null> {
  if (!hasActiveZipArchive()) return null;
  const key=sourceKey(name,exactEntry);
  const cached = options?.signal?.aborted ? undefined : zipMaskState.getCached(key);
  if (cached && (options?.maxBytes === undefined || cached.size <= options.maxBytes)) return cached;
  if (exactEntry) {
    const keys=exactMaskKeys.get(name) ?? new Set<string>();keys.add(key);exactMaskKeys.set(name,keys);
  }
  const imageIndex = getActiveZipImageIndex();
  if (!imageIndex) return null;
  summariseZipMasks(imageIndex);
  if (cached) throw new Error(`${name} exceeds its read budget.`);
  const limit=options?.maxBytes ?? (exactEntry ? 64 * 1024 * 1024 : undefined);
  return zipMaskState.request(JSON.stringify([key,limit ?? null]), async context => {
    const retain=(file: File): File => {
      if (limit !== undefined && file.size > limit) throw new Error(`${name} exceeds its read budget.`);
      if (context.isCurrent()) zipMaskState.setCached(key,file);
      return file;
    };
    if (exactEntry) {
      if (exactEntry.size > limit!) throw new Error(`${name} exceeds its read budget.`);
      return retain(await exactEntry.extract({ signal: context.signal, getPriority: context.getPriority }));
    }
    let extractionFailed = false;
    for (const path of getMaskPathVariants(name)) {
      if (!context.isCurrent()) return null;
      const entry = findZipEntry(path, imageIndex);
      if (entry) {
        if (options?.maxBytes !== undefined && entry.size > options.maxBytes) throw new Error(`${name} exceeds its read budget.`);
        try {
          const file = await entry.extract({ signal: context.signal, getPriority: context.getPriority });
          if (!context.isCurrent()) return null;
          return retain(file);
        } catch { extractionFailed = true; /* Try the next candidate. */ }
      }
    }
    if (extractionFailed && context.isCurrent()) options?.onError?.({ kind: 'network', message: `Could not extract mask for ${name}` });
    return null;
  }, options, false);
}

export function removeZipMaskCacheEntries(names: string[]): void {
  for (const name of names) {
    zipMaskState.deleteCached(name);
    for (const key of exactMaskKeys.get(name) ?? []) zipMaskState.deleteCached(key);
    exactMaskKeys.delete(name);
  }
}
export function clearZipCache(): void {
  zipImageState.clear();
  zipMaskState.clear();
  zipRawState.clear();
  exactMaskKeys.clear();
  clearActiveZipArchive();
}
export function getZipImageCacheStats() { return zipImageState.getStats(); }
export function getZipMaskCacheStats() { return zipMaskState.getStats(); }

export function getZipImageGeneration() { return zipImageState.getGeneration(); }
