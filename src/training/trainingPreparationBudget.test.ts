import { describe, expect, it } from 'vitest';
import { TrainingPreparationBudget, estimateTrainingRasterBytes } from './trainingPreparationBudget';

describe('training preparation reservations', () => {
  it('bounds bytes and admits queued work when ownership is released', async () => {
    const budget = new TrainingPreparationBudget(10, 4);
    const first = await budget.acquire(6);
    const second = budget.acquire(5);
    expect(budget.inspect()).toEqual({ active: 1, bytes: 6, queued: 1 });
    first(); first();
    const release = await second;
    expect(budget.inspect()).toEqual({ active: 1, bytes: 5, queued: 0 });
    release();
    expect(budget.inspect().bytes).toBe(0);
  });

  it('runs an oversized item exclusively in FIFO order without deadlock', async () => {
    const budget = new TrainingPreparationBudget(10, 4);
    const first = await budget.acquire(2);
    const large = budget.acquire(20);
    const small = budget.acquire(1);
    expect(budget.inspect()).toEqual({ active: 1, bytes: 2, queued: 2 });
    first();
    const releaseLarge = await large;
    expect(budget.inspect()).toEqual({ active: 1, bytes: 20, queued: 1 });
    releaseLarge();
    (await small)();
    expect(budget.inspect()).toEqual({ active: 0, bytes: 0, queued: 0 });
  });

  it('removes a cancelled head and immediately admits the next fitting item', async () => {
    const budget = new TrainingPreparationBudget(10, 2);
    const first = await budget.acquire(6);
    const abort = new AbortController();
    const cancelled = budget.acquire(8, abort.signal);
    const rejection = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    const small = budget.acquire(1);
    abort.abort();
    await rejection;
    const releaseSmall = await small;
    expect(budget.inspect()).toEqual({ active: 2, bytes: 7, queued: 0 });
    releaseSmall(); first();
  });

  it('requires active owners to release even after cancellation', async () => {
    const budget = new TrainingPreparationBudget(10, 1);
    const abort = new AbortController();
    const release = await budget.acquire(1, abort.signal);
    abort.abort();
    expect(budget.inspect().active).toBe(1);
    release();
    expect(budget.inspect().active).toBe(0);
  });

  it('validates estimates and reserves unknown dimensions exclusively', () => {
    expect(estimateTrainingRasterBytes()).toBeGreaterThan(256 * 1024 * 1024);
    expect(estimateTrainingRasterBytes({ width: 100, height: 100 })).toBe(120000 + 1024 * 1024);
    expect(() => estimateTrainingRasterBytes({ width: -1, height: 100 })).toThrow();
  });
});
