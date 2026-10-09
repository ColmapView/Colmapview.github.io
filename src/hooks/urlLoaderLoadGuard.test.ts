import { afterEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../store/reconstructionStore';
import { claimUrlLoad } from './urlLoaderLoadGuard';

const cancelled = expect.objectContaining({ name: 'AbortError', message: 'Dataset load cancelled' });

afterEach(() => { useReconstructionStore.getState().clear(); });

describe('URL load claim', () => {
  it('holds the one URL load and refuses another claim while it is held', () => {
    const claim = claimUrlLoad()!;

    expect(useReconstructionStore.getState()).toMatchObject({ urlLoadActive: true });
    expect(useReconstructionStore.getState().urlLoadController?.signal).toBe(claim.signal);
    expect(claim.isCurrent()).toBe(true);
    expect(() => claim.assertCurrent()).not.toThrow();
    expect(claimUrlLoad()).toBeNull();
    expect(useReconstructionStore.getState().urlLoadController?.signal).toBe(claim.signal);
  });

  it('stops being current once its load finishes, which frees the guard', () => {
    const claim = claimUrlLoad()!;

    useReconstructionStore.getState().finishUrlLoad(claim.signal);

    expect(claim.signal.aborted).toBe(true);
    expect(claim.isCurrent()).toBe(false);
    expect(() => claim.assertCurrent()).toThrow(cancelled);
    expect(claimUrlLoad()).not.toBeNull();
  });

  it.each(['cancelLoading', 'clear'] as const)('stops being current after %s, and stays stale once a newer load claims the guard', action => {
    const claim = claimUrlLoad()!;

    useReconstructionStore.getState()[action]();
    expect(claim.isCurrent()).toBe(false);

    const next = claimUrlLoad()!;
    expect(next.isCurrent()).toBe(true);
    expect(claim.isCurrent()).toBe(false);
    expect(() => claim.assertCurrent()).toThrow(cancelled);
  });

  it('is not current once the store no longer holds its controller, even before its signal aborts', () => {
    const claim = claimUrlLoad()!;

    useReconstructionStore.setState({ urlLoadActive: false, urlLoadController: null });

    expect(claim.signal.aborted).toBe(false);
    expect(claim.isCurrent()).toBe(false);
    expect(() => claim.assertCurrent()).toThrow(cancelled);
  });
});
