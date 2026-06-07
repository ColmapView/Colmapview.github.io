import { drawImageBitmapToCacheCanvas } from './asyncImageCanvas';
import type { AsyncImageCachePendingItem } from './asyncImageCacheState';

type CacheCanvas = HTMLCanvasElement | OffscreenCanvas;
type DrawToCanvas = (bitmap: ImageBitmap, maxSize: number) => CacheCanvas | null;
type ProcessCanvas<T> = (canvas: CacheCanvas) => T | Promise<T | null>;

export interface ProcessAsyncImagePendingItemDeps<T> {
  cache: Map<string, T>;
  drawToCanvas?: DrawToCanvas;
  maxSize: number;
  processCanvas: ProcessCanvas<T>;
}

export function processAsyncImagePendingItem<T>(
  pending: AsyncImageCachePendingItem<T>,
  deps: ProcessAsyncImagePendingItemDeps<T>
): void {
  const cached = deps.cache.get(pending.cacheKey);
  if (cached) {
    pending.bitmap.close();
    pending.resolve(cached);
    return;
  }

  const drawToCanvas = deps.drawToCanvas ?? drawImageBitmapToCacheCanvas;
  const canvas = drawToCanvas(pending.bitmap, deps.maxSize);
  if (!canvas) {
    pending.resolve(null);
    return;
  }

  const result = deps.processCanvas(canvas);

  if (result instanceof Promise) {
    result.then((value) => {
      if (value !== null) {
        deps.cache.set(pending.cacheKey, value);
      }
      pending.resolve(value);
    }).catch(() => {
      pending.resolve(null);
    });
    return;
  }

  deps.cache.set(pending.cacheKey, result);
  pending.resolve(result);
}
