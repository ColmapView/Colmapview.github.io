import { TIMING } from '../theme';
import { appLogger } from '../utils/logger';
import { processAsyncImagePendingItem, type ProcessAsyncImagePendingItemDeps } from './asyncImageCachePendingItem';
import type { AsyncImageCachePendingItem, AsyncImageCacheState } from './asyncImageCacheState';
import {
  createIdleProcessingLogger,
  shouldProcessNextPendingItem,
  shouldScheduleIdleProcessing,
  type IdleProcessingLogger,
} from './asyncImageCacheQueuePolicy';

type CacheCanvas = HTMLCanvasElement | OffscreenCanvas;
type ProcessCanvas<T> = (canvas: CacheCanvas) => T | Promise<T | null>;
type ProcessPendingItem<T> = (
  pending: AsyncImageCachePendingItem<T>,
  deps: ProcessAsyncImagePendingItemDeps<T>
) => void;
type RequestIdleCallback = (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;

export interface AsyncImageCacheScheduler {
  processPendingItems: (deadline?: IdleDeadline, maxItems?: number) => void;
  scheduleIdleProcessing: () => void;
}

export interface AsyncImageCacheSchedulerOptions<T> {
  state: AsyncImageCacheState<T>;
  maxSize: number;
  processCanvas: ProcessCanvas<T>;
  idleTimeout: number;
  idleFallback: number;
  processPendingItem?: ProcessPendingItem<T>;
  idleProcessingLogger?: IdleProcessingLogger;
  now?: () => number;
  log?: (message: string) => void;
  requestIdleCallback?: RequestIdleCallback;
  scheduleMicrotask?: (callback: () => void) => void;
  scheduleTimeout?: (callback: () => void, delay: number) => void;
}

export function createAsyncImageCacheScheduler<T>({
  state,
  maxSize,
  processCanvas,
  idleTimeout,
  idleFallback,
  processPendingItem = processAsyncImagePendingItem,
  idleProcessingLogger = createIdleProcessingLogger(),
  now = Date.now,
  log = appLogger.info,
  requestIdleCallback,
  scheduleMicrotask = queueMicrotask,
  scheduleTimeout = setTimeout,
}: AsyncImageCacheSchedulerOptions<T>): AsyncImageCacheScheduler {
  function processPendingItems(deadline?: IdleDeadline, maxItems?: number): void {
    if (state.paused) {
      state.idleCallbackScheduled = false;
      return;
    }

    let processedCount = 0;

    while (state.pendingItems.length > 0) {
      if (!shouldProcessNextPendingItem({
        processedCount,
        maxItems,
        timeRemaining: deadline?.timeRemaining(),
        idleDeadlineBuffer: TIMING.idleDeadlineBuffer,
      })) {
        break;
      }
      processedCount++;

      const pending = state.pendingItems.shift()!;

      processPendingItem(pending, {
        cache: state.cache,
        maxSize,
        processCanvas,
      });
    }

    state.idleCallbackScheduled = false;

    if (state.pendingItems.length > 0) {
      scheduleIdleProcessing();
    }
  }

  function scheduleIdleProcessing(): void {
    if (!shouldScheduleIdleProcessing(state.idleCallbackScheduled, state.paused)) return;
    state.idleCallbackScheduled = true;

    if (state.bulkMode) {
      scheduleMicrotask(() => {
        processPendingItems();
      });
      return;
    }

    const requestIdle = requestIdleCallback ?? window.requestIdleCallback?.bind(window);

    if (requestIdle) {
      requestIdle((deadline) => {
        const logMessage = idleProcessingLogger.next(
          state.pendingItems.length,
          deadline?.timeRemaining(),
          now()
        );
        if (logMessage) {
          log(logMessage);
        }
        processPendingItems(deadline);
      }, { timeout: idleTimeout });
      return;
    }

    scheduleTimeout(() => {
      processPendingItems();
    }, idleFallback);
  }

  return {
    processPendingItems,
    scheduleIdleProcessing,
  };
}
