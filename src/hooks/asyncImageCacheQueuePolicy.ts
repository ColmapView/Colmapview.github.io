export const MAX_PENDING_IMAGE_ITEMS = 50;
export const PENDING_BACKPRESSURE_BATCH_SIZE = 10;
export const MIN_PENDING_ITEMS_PER_IDLE_CALLBACK = 1;
export const PENDING_PROCESSING_TIME_SLICE_MS = 8;
export const IDLE_PENDING_PROCESSING_BATCH_SIZE = 2;
export const BULK_PENDING_PROCESSING_BATCH_SIZE = 2;
export const IDLE_LOG_CALL_INTERVAL = 100;
export const IDLE_LOG_INTERVAL_MS = 10_000;

export interface PendingProcessingDecision {
  processedCount: number;
  maxItems?: number;
  elapsedMs?: number;
  maxElapsedMs?: number;
  timeRemaining?: number;
  idleDeadlineBuffer: number;
  minItemsPerCallback?: number;
}

export interface IdleProcessingLogDecision {
  idleCallCount: number;
  pendingItemCount: number;
  nowMs: number;
  lastLogMs: number;
  callInterval?: number;
  timeIntervalMs?: number;
}

export interface IdleProcessingLogger {
  next(pendingItemCount: number, timeRemaining: number | undefined, nowMs: number): string | null;
}

export function shouldScheduleIdleProcessing(isScheduled: boolean, isPaused: boolean): boolean {
  return !isScheduled && !isPaused;
}

export function shouldProcessNextPendingItem({
  processedCount,
  maxItems,
  elapsedMs,
  maxElapsedMs,
  timeRemaining,
  idleDeadlineBuffer,
  minItemsPerCallback = MIN_PENDING_ITEMS_PER_IDLE_CALLBACK,
}: PendingProcessingDecision): boolean {
  if (maxItems !== undefined && processedCount >= maxItems) {
    return false;
  }

  if (
    processedCount >= minItemsPerCallback &&
    maxElapsedMs !== undefined &&
    elapsedMs !== undefined &&
    elapsedMs >= maxElapsedMs
  ) {
    return false;
  }

  if (
    processedCount >= minItemsPerCallback &&
    timeRemaining !== undefined &&
    timeRemaining < idleDeadlineBuffer
  ) {
    return false;
  }

  return true;
}

export function shouldApplyPendingBackpressure(
  pendingItemCount: number,
  maxPendingItems = MAX_PENDING_IMAGE_ITEMS
): boolean {
  return pendingItemCount >= maxPendingItems;
}

export function canStartQueuedLoad(
  isPaused: boolean,
  activeLoads: number,
  maxConcurrentLoads: number,
  pendingQueueLength: number
): boolean {
  return !isPaused && activeLoads < maxConcurrentLoads && pendingQueueLength > 0;
}

export function shouldLogIdleProcessing({
  idleCallCount,
  pendingItemCount,
  nowMs,
  lastLogMs,
  callInterval = IDLE_LOG_CALL_INTERVAL,
  timeIntervalMs = IDLE_LOG_INTERVAL_MS,
}: IdleProcessingLogDecision): boolean {
  return idleCallCount % callInterval === 0 || (
    pendingItemCount > 0 &&
    nowMs - lastLogMs > timeIntervalMs
  );
}

export function formatIdleProcessingLogMessage(
  idleCallCount: number,
  pendingItemCount: number,
  timeRemaining: number | undefined
): string {
  return `Idle callback #${idleCallCount}: ${pendingItemCount} items to process, ${timeRemaining?.toFixed(0)}ms remaining`;
}

export function createIdleProcessingLogger(): IdleProcessingLogger {
  let idleCallCount = 0;
  let lastLogMs = 0;

  return {
    next(pendingItemCount: number, timeRemaining: number | undefined, nowMs: number): string | null {
      idleCallCount++;

      if (!shouldLogIdleProcessing({
        idleCallCount,
        pendingItemCount,
        nowMs,
        lastLogMs,
      })) {
        return null;
      }

      lastLogMs = nowMs;
      return formatIdleProcessingLogMessage(idleCallCount, pendingItemCount, timeRemaining);
    },
  };
}
