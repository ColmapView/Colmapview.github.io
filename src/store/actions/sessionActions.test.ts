import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmReload, hasUnsavedReloadState } from './sessionActions';
import { useTransformStore } from '../stores/transformStore';
import { useDeletionStore } from '../stores/deletionStore';

describe('reload confirmation gating', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useTransformStore.setState(useTransformStore.getInitialState(), true);
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

  it('detects an applied splat transform', () => {
    useTransformStore.getState().setSplatTransform({
      scale: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      translationX: 2,
      translationY: 0,
      translationZ: 0,
    });

    expect(hasUnsavedReloadState()).toBe(true);
  });

  it('detects pending deletions', () => {
    useDeletionStore.getState().markForDeletion(42);
    expect(hasUnsavedReloadState()).toBe(true);
  });

  it('confirmReload skips the prompt when there is nothing to lose', async () => {
    const result = await confirmReload();
    expect(result).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('confirmReload prompts when a transform is active and returns the user answer', async () => {
    useTransformStore.getState().setTransform({ scale: 2 });

    confirmSpy.mockReturnValueOnce(true);
    await expect(confirmReload()).resolves.toBe(true);
    expect(confirmSpy).toHaveBeenCalledTimes(1);

    confirmSpy.mockReturnValueOnce(false);
    await expect(confirmReload()).resolves.toBe(false);
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it('confirmReload prompts when deletions are pending', async () => {
    useDeletionStore.getState().markForDeletion(7);
    confirmSpy.mockReturnValueOnce(false);
    await expect(confirmReload()).resolves.toBe(false);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });
});
