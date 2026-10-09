import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginReconstructionLoad,
  cancelPendingReconstructionLoad,
  getReconstructionLoadGeneration,
  hasReconstructionSceneCommitted,
  markReconstructionSceneCommitted,
  onReconstructionLoadStart,
} from './reconstructionLoadLifecycle';

afterEach(() => cancelPendingReconstructionLoad());

describe('reconstruction load lifecycle', () => {
  it('keeps the committed scene associated with its URL request after parsing finishes, until cancellation', () => {
    const source = new AbortController();
    const load = beginReconstructionLoad();
    expect(hasReconstructionSceneCommitted()).toBe(false);
    expect(hasReconstructionSceneCommitted(source.signal)).toBe(false);
    markReconstructionSceneCommitted(load.signal, source.signal);
    expect(hasReconstructionSceneCommitted()).toBe(true);
    load.finish();
    expect(hasReconstructionSceneCommitted()).toBe(false);
    expect(hasReconstructionSceneCommitted(source.signal)).toBe(true);
    beginReconstructionLoad();
    expect(hasReconstructionSceneCommitted()).toBe(false);
    source.abort();
    expect(hasReconstructionSceneCommitted(source.signal)).toBe(false);
  });

  it('does not let a superseded parse or an aborted source hand progress to its renderer', () => {
    const stale = beginReconstructionLoad();
    const current = beginReconstructionLoad();
    const source = new AbortController();
    markReconstructionSceneCommitted(stale.signal, source.signal);
    expect(hasReconstructionSceneCommitted()).toBe(false);
    expect(hasReconstructionSceneCommitted(source.signal)).toBe(false);
    source.abort();
    markReconstructionSceneCommitted(current.signal, source.signal);
    expect(hasReconstructionSceneCommitted()).toBe(false);
    expect(hasReconstructionSceneCommitted(source.signal)).toBe(false);
  });

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
