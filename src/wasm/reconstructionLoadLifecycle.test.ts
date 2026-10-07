import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginReconstructionLoad,
  cancelPendingReconstructionLoad,
  getReconstructionLoadGeneration,
  onReconstructionLoadStart,
} from './reconstructionLoadLifecycle';

afterEach(() => cancelPendingReconstructionLoad());

describe('reconstruction load lifecycle', () => {
  it('tells listeners when a dataset load starts, and only then', () => {
    const listener = vi.fn();
    const stop = onReconstructionLoadStart(listener);
    const load = beginReconstructionLoad();
    expect(listener).toHaveBeenCalledOnce();
    load.finish();
    cancelPendingReconstructionLoad();
    expect(listener).toHaveBeenCalledOnce();
    beginReconstructionLoad();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    beginReconstructionLoad();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('moves the generation on when a load starts or is cancelled, not when one finishes', () => {
    const start = getReconstructionLoadGeneration();
    const load = beginReconstructionLoad();
    const begun = getReconstructionLoadGeneration();
    expect(begun).not.toBe(start);
    load.finish();
    expect(getReconstructionLoadGeneration()).toBe(begun);
    cancelPendingReconstructionLoad();
    expect(getReconstructionLoadGeneration()).not.toBe(begun);
  });

  it('still tells the other listeners when one unsubscribes while being told', () => {
    const order: string[] = [];
    const stopFirst = onReconstructionLoadStart(() => { order.push('first'); stopFirst(); });
    const stopSecond = onReconstructionLoadStart(() => order.push('second'));
    beginReconstructionLoad();
    beginReconstructionLoad();
    stopSecond();
    expect(order).toEqual(['first', 'second', 'second']);
  });
});
