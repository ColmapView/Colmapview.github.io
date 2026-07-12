import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../store';
import { useHotkeyHelpStoreFacade } from './useHotkeyHelpStoreFacade';

const DEFAULT_FACADE = {
  touchMode: false,
  embedMode: false,
  // Defaults: buttons participate in auto-hide, viewer starts active.
  autoHideButtons: true,
  isIdle: false,
  showAutoHideEditor: false,
};

describe('useHotkeyHelpStoreFacade', () => {
  afterEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('mirrors touch/embed mode and auto-hide chrome state from the UI store', () => {
    const { result } = renderHook(() => useHotkeyHelpStoreFacade());

    expect(result.current).toEqual(DEFAULT_FACADE);
  });

  it('reflects touch mode changes from the store', () => {
    const { result } = renderHook(() => useHotkeyHelpStoreFacade());

    act(() => {
      useUIStore.getState().setTouchMode(true);
    });

    expect(result.current).toEqual({ ...DEFAULT_FACADE, touchMode: true });
  });

  it('reflects embed mode changes from the store', () => {
    const { result } = renderHook(() => useHotkeyHelpStoreFacade());

    act(() => {
      useUIStore.getState().setEmbedMode(true);
    });

    expect(result.current).toEqual({ ...DEFAULT_FACADE, embedMode: true });
  });

  it('reflects idle state and the buttons auto-hide toggle from the store', () => {
    const { result } = renderHook(() => useHotkeyHelpStoreFacade());

    act(() => {
      useUIStore.setState({
        isIdle: true,
        autoHideElements: { ...useUIStore.getState().autoHideElements, buttons: false },
      });
    });

    expect(result.current).toEqual({ ...DEFAULT_FACADE, isIdle: true, autoHideButtons: false });
  });
});
