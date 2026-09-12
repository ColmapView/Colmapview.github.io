import {
  hasActiveZipArchive, findZipEntry, extractZipImage, getActiveZipImageIndex, clearActiveZipArchive,
} from './zipLoader';
import { appLogger } from './logger';
import { getMaskPathVariants } from './imageFileLookupPolicy';
import { compressAndResizeToJpeg } from './imageFileCompression';
import { createImageFileRequestState } from './imageFileRequestState';
import type { DatasetAccessOptions } from '../dataset/types';

const zipImageState = createImageFileRequestState();
const zipMaskState = createImageFileRequestState();
const zipRawState = createImageFileRequestState();

export function getZipImageCached(name: string): File | undefined { return zipImageState.getCached(name); }
export function getZipMaskCached(name: string): File | undefined { return zipMaskState.getCached(name); }
export function isZipLoadingAvailable(): boolean { return hasActiveZipArchive(); }

export async function fetchZipImage(name: string, options?: DatasetAccessOptions): Promise<File | null> {
  if (!hasActiveZipArchive()) return null;
  return zipImageState.request(name, async context => {
    const file = await extractZipImage(name);
    if (!file || !context.isCurrent()) return null;
    const blob = new Blob([await file.arrayBuffer()]);
    if (!context.isCurrent()) return null;
    return compressAndResizeToJpeg(blob, name.split('/').pop() || name);
  }, options);
}

export async function fetchZipImageRaw(name: string, options?: DatasetAccessOptions): Promise<File | null> {
  if (!hasActiveZipArchive()) return null;
  return zipRawState.request(name, async () => extractZipImage(name), options, false);
}

export async function fetchZipMask(name: string, options?: DatasetAccessOptions): Promise<File | null> {
  if (!hasActiveZipArchive()) return null;
  const cached = options?.signal?.aborted ? undefined : zipMaskState.getCached(name);
  if (cached) return cached;
  const imageIndex = getActiveZipImageIndex();
  if (!imageIndex) return null;
  return zipMaskState.request(name, async context => {
    for (const path of getMaskPathVariants(name)) {
      if (!context.isCurrent()) return null;
      const entry = findZipEntry(path, imageIndex);
      if (entry) {
        try {
          const file = await entry.extract();
          if (!context.isCurrent()) return null;
          appLogger.info(`[ZIP Mask] Found mask for ${name}`);
          return file;
        } catch { /* Try the next candidate. */ }
      }
    }
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
