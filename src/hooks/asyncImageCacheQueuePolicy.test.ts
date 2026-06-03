import { describe, expect, it } from 'vitest';
import {
  PENDING_BACKPRESSURE_BATCH_SIZE,
  canStartQueuedLoad,
  createIdleProcessingLogger,
  formatIdleProcessingLogMessage,
  shouldApplyPendingBackpressure,
  shouldLogIdleProcessing,
  shouldProcessNextPendingItem,
  shouldScheduleIdleProcessing,
} from './asyncImageCacheQueuePolicy';

describe('async image cache queue policy', () => {
  it('schedules idle processing only when not already scheduled or paused', () => {
    expect(shouldScheduleIdleProcessing(false, false)).toBe(true);
    expect(shouldScheduleIdleProcessing(true, false)).toBe(false);
    expect(shouldScheduleIdleProcessing(false, true)).toBe(false);
  });

  it('keeps one pending item per callback before honoring idle time pressure', () => {
    expect(shouldProcessNextPendingItem({
      processedCount: 0,
      timeRemaining: 0,
      idleDeadlineBuffer: 5,
    })).toBe(true);

    expect(shouldProcessNextPendingItem({
      processedCount: 1,
      timeRemaining: 4,
      idleDeadlineBuffer: 5,
    })).toBe(false);

    expect(shouldProcessNextPendingItem({
      processedCount: 1,
      timeRemaining: 5,
      idleDeadlineBuffer: 5,
    })).toBe(true);
  });

  it('stops pending processing at the explicit backpressure batch limit', () => {
    expect(shouldProcessNextPendingItem({
      processedCount: PENDING_BACKPRESSURE_BATCH_SIZE - 1,
      maxItems: PENDING_BACKPRESSURE_BATCH_SIZE,
      idleDeadlineBuffer: 5,
    })).toBe(true);

    expect(shouldProcessNextPendingItem({
      processedCount: PENDING_BACKPRESSURE_BATCH_SIZE,
      maxItems: PENDING_BACKPRESSURE_BATCH_SIZE,
      idleDeadlineBuffer: 5,
    })).toBe(false);
  });

  it('applies pending-item backpressure at the configured threshold', () => {
    expect(shouldApplyPendingBackpressure(49)).toBe(false);
    expect(shouldApplyPendingBackpressure(50)).toBe(true);
    expect(shouldApplyPendingBackpressure(3, 3)).toBe(true);
  });

  it('starts queued loads only while active capacity is available', () => {
    expect(canStartQueuedLoad(false, 2, 4, 1)).toBe(true);
    expect(canStartQueuedLoad(true, 2, 4, 1)).toBe(false);
    expect(canStartQueuedLoad(false, 4, 4, 1)).toBe(false);
    expect(canStartQueuedLoad(false, 2, 4, 0)).toBe(false);
  });

  it('logs idle processing by call interval or delayed pending work', () => {
    expect(shouldLogIdleProcessing({
      idleCallCount: 100,
      pendingItemCount: 0,
      nowMs: 1000,
      lastLogMs: 1000,
    })).toBe(true);

    expect(shouldLogIdleProcessing({
      idleCallCount: 3,
      pendingItemCount: 2,
      nowMs: 11_001,
      lastLogMs: 1000,
    })).toBe(true);

    expect(shouldLogIdleProcessing({
      idleCallCount: 3,
      pendingItemCount: 0,
      nowMs: 11_001,
      lastLogMs: 1000,
    })).toBe(false);
  });

  it('formats and advances idle processing logs with internal cadence state', () => {
    expect(formatIdleProcessingLogMessage(2, 5, 12.4)).toBe(
      'Idle callback #2: 5 items to process, 12ms remaining'
    );

    const logger = createIdleProcessingLogger();
    expect(logger.next(0, 4, 1000)).toBeNull();
    expect(logger.next(2, 8.8, 11_001)).toBe(
      'Idle callback #2: 2 items to process, 9ms remaining'
    );
    expect(logger.next(2, 8.8, 12_000)).toBeNull();
  });
});
