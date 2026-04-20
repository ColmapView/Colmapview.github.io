import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmReload, hasUnsavedReloadState } from './sessionActions';
import { useTransformStore } from '../stores/transformStore';
import { useDeletionStore } from '../stores/deletionStore';

describe('reload confirmation gating', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useTransformStore.getState().resetTransform();
    useDeletionStore.getState().clearPendingDeletions();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('returns false for unsaved state when nothing is pending', () => {
    expect(hasUnsavedReloadState()).toBe(false);
  });

  it('detects a non-identity transform', () => {
    useTransformStore.getState().setTransform({ rotationY: Math.PI / 4 });
    expect(hasUnsavedReloadState()).toBe(true);
  });

  it('detects pending deletions', () => {
    useDeletionStore.getState().markForDeletion(42);
    expect(hasUnsavedReloadState()).toBe(true);
  });

  it('confirmReload skips the prompt when there is nothing to lose', () => {
    const result = confirmReload();
    expect(result).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('confirmReload prompts when a transform is active and returns the user answer', () => {
    useTransformStore.getState().setTransform({ scale: 2 });

    confirmSpy.mockReturnValueOnce(true);
    expect(confirmReload()).toBe(true);
    expect(confirmSpy).toHaveBeenCalledTimes(1);

    confirmSpy.mockReturnValueOnce(false);
    expect(confirmReload()).toBe(false);
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it('confirmReload prompts when deletions are pending', () => {
    useDeletionStore.getState().markForDeletion(7);
    confirmSpy.mockReturnValueOnce(false);
    expect(confirmReload()).toBe(false);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });
});
