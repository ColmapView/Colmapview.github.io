import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../store';
import { useHotkeyHelpStoreFacade } from './useHotkeyHelpStoreFacade';

const DEFAULT_FACADE = {
  // Panel open state is store-owned so the status bar's Shortcuts entry can
  // open this exact panel.
  showHotkeyHelp: false,
  hotkeyHelpInitialTab: 'essentials',
  setShowHotkeyHelp: expect.any(Function),
  toggleHotkeyHelp: expect.any(Function),
};

describe('useHotkeyHelpStoreFacade', () => {
  afterEach(() => {
    act(() => {
      useUIStore.setState(useUIStore.getInitialState(), true);
    });
  });

  it('exposes only the shared panel open state', () => {
    const { result } = renderHook(() => useHotkeyHelpStoreFacade());

    // toEqual fails on any extra key, so this pins the whole facade shape.
    expect(result.current).toEqual(DEFAULT_FACADE);
  });

  it('reflects and writes the shared panel open state', () => {
    const { result } = renderHook(() => useHotkeyHelpStoreFacade());

    act(() => {
      result.current.setShowHotkeyHelp(true);
    });

    expect(useUIStore.getState().showHotkeyHelp).toBe(true);
    expect(result.current).toEqual({ ...DEFAULT_FACADE, showHotkeyHelp: true });
  });

  it('flips the panel open state through the store toggle, identity-stable', () => {
    const { result } = renderHook(() => useHotkeyHelpStoreFacade());
    const toggle = result.current.toggleHotkeyHelp;

    act(() => {
      toggle();
    });
    expect(useUIStore.getState().showHotkeyHelp).toBe(true);

    act(() => {
      toggle();
    });
    expect(useUIStore.getState().showHotkeyHelp).toBe(false);
    // The action never changes identity, so consumers need no memoization.
    expect(result.current.toggleHotkeyHelp).toBe(toggle);
  });

  it('ignores touch mode, embed mode, and idle chrome changes', () => {
    const { result } = renderHook(() => useHotkeyHelpStoreFacade());
    const before = result.current;

    act(() => {
      useUIStore.setState({ touchMode: true, embedMode: true, isIdle: true });
    });

    // Same object identity: the facade subscribes to none of those keys, so
    // re-adding a touchMode/embedMode/isIdle gate here (the pre-0.11 shape)
    // fails this test instead of silently breaking the touch Help entry.
    expect(result.current).toBe(before);
  });
});
