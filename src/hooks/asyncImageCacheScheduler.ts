import { TIMING } from '../theme';
import { appLogger } from '../utils/logger';
import { processAsyncImagePendingItem, type ProcessAsyncImagePendingItemDeps } from './asyncImageCachePendingItem';
import type { AsyncImageCachePendingItem, AsyncImageCacheState } from './asyncImageCacheState';
import {
  BULK_PENDING_PROCESSING_BATCH_SIZE,
  createIdleProcessingLogger,
  IDLE_PENDING_PROCESSING_BATCH_SIZE,
  PENDING_PROCESSING_TIME_SLICE_MS,
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
  scheduleTimeout?: (callback: () => void, delay: number) => void;
  maxIdleItems?: number;
  maxBulkItems?: number;
  maxProcessingMs?: number;
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
  scheduleTimeout = setTimeout,
  maxIdleItems = IDLE_PENDING_PROCESSING_BATCH_SIZE,
  maxBulkItems = BULK_PENDING_PROCESSING_BATCH_SIZE,
  maxProcessingMs = PENDING_PROCESSING_TIME_SLICE_MS,
}: AsyncImageCacheSchedulerOptions<T>): AsyncImageCacheScheduler {
  function processPendingItems(deadline?: IdleDeadline, maxItems?: number): void {
    if (state.paused) {
      state.idleCallbackScheduled = false;
      return;
    }

    let processedCount = 0;
    const startedAt = now();

    while (state.pendingItems.length > 0) {
      if (!shouldProcessNextPendingItem({
        processedCount,
        maxItems,
        elapsedMs: now() - startedAt,
        maxElapsedMs: maxProcessingMs,
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
      scheduleTimeout(() => {
        processPendingItems(undefined, maxBulkItems);
      }, 0);
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
        processPendingItems(deadline, maxIdleItems);
      }, { timeout: idleTimeout });
      return;
    }

    scheduleTimeout(() => {
      processPendingItems(undefined, maxIdleItems);
    }, idleFallback);
  }

  return {
    processPendingItems,
    scheduleIdleProcessing,
  };
}
