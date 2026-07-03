import { createElement, type ReactNode } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useGuideStore,
  useNotificationStore,
  usePointPickingStore,
} from '../../store';
import { COLMAP_JOKES, getColmapJoke, useViewerControlHotkeys } from './useViewerControlHotkeys';

function hotkeyWrapper({ children }: { children: ReactNode }) {
  return createElement(HotkeysProvider, { initiallyActiveScopes: ['viewer'] }, children);
}

describe('viewer control hotkey helpers', () => {
  beforeEach(() => {
    useGuideStore.setState(useGuideStore.getInitialState(), true);
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    usePointPickingStore.setState(usePointPickingStore.getInitialState(), true);
  });

  it('selects a COLMAP joke from a random value', () => {
    expect(getColmapJoke(0)).toBe(COLMAP_JOKES[0]);
    expect(getColmapJoke(0.99999)).toBe(COLMAP_JOKES[COLMAP_JOKES.length - 1]);
    expect(getColmapJoke(1)).toBe(COLMAP_JOKES[COLMAP_JOKES.length - 1]);
  });

  it('routes N to next splat file cycling', () => {
    const cycleSplatFile = vi.fn();

    renderHook(() => useViewerControlHotkeys({
      handleResetView: vi.fn(),
      setView: vi.fn(),
      cycleAxesGrid: vi.fn(),
      toggleCameraMode: vi.fn(),
      toggleBackground: vi.fn(),
      cycleColorMode: vi.fn(),
      cycleSplatFile,
      cycleCameraDisplayMode: vi.fn(),
      cycleMatchesDisplayMode: vi.fn(),
      cycleHorizonLock: vi.fn(),
      cycleAutoRotate: vi.fn(),
      toggleUndistortion: vi.fn(),
    }), { wrapper: hotkeyWrapper });

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', bubbles: true }));
    });

    expect(cycleSplatFile).toHaveBeenCalledTimes(1);
  });

  it('routes O to auto orbit cycling', () => {
    const cycleAutoRotate = vi.fn();

    renderHook(() => useViewerControlHotkeys({
      handleResetView: vi.fn(),
      setView: vi.fn(),
      cycleAxesGrid: vi.fn(),
      toggleCameraMode: vi.fn(),
      toggleBackground: vi.fn(),
      cycleColorMode: vi.fn(),
      cycleSplatFile: vi.fn(),
      cycleCameraDisplayMode: vi.fn(),
      cycleMatchesDisplayMode: vi.fn(),
      cycleHorizonLock: vi.fn(),
      cycleAutoRotate,
      toggleUndistortion: vi.fn(),
    }), { wrapper: hotkeyWrapper });

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', code: 'KeyO', bubbles: true }));
    });

    expect(cycleAutoRotate).toHaveBeenCalledTimes(1);
  });
});
