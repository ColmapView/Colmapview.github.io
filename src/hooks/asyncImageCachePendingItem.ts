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
  isCurrent?: () => boolean;
  dispose?: (value: T) => void;
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

  const complete = (value: T | null) => {
    if (deps.isCurrent && !deps.isCurrent()) {
      if (value !== null) deps.dispose?.(value);
      pending.resolve(null);
    } else {
      if (value !== null) {
        deps.cache.set(pending.cacheKey, value);
      }
      pending.resolve(value);
    }
  };

  try {
    const drawToCanvas = deps.drawToCanvas ?? drawImageBitmapToCacheCanvas;
    const canvas = drawToCanvas(pending.bitmap, deps.maxSize);
    if (!canvas) {
      pending.resolve(null);
      return;
    }

    const result = deps.processCanvas(canvas);
    if (result instanceof Promise) {
      void result.then(complete).catch(() => pending.resolve(null));
    } else {
      complete(result);
    }
  } catch {
    pending.resolve(null);
  }
}
