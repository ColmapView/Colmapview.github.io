import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../store';
import { useHotkeyHelpStoreFacade } from './useHotkeyHelpStoreFacade';

describe('useHotkeyHelpStoreFacade', () => {
  afterEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('mirrors touch and embed mode from the UI store', () => {
    const { result } = renderHook(() => useHotkeyHelpStoreFacade());

    expect(result.current).toEqual({ touchMode: false, embedMode: false });
  });

  it('reflects touch mode changes from the store', () => {
    const { result } = renderHook(() => useHotkeyHelpStoreFacade());

    act(() => {
      useUIStore.getState().setTouchMode(true);
    });

    expect(result.current).toEqual({ touchMode: true, embedMode: false });
  });

  it('reflects embed mode changes from the store', () => {
    const { result } = renderHook(() => useHotkeyHelpStoreFacade());

    act(() => {
      useUIStore.getState().setEmbedMode(true);
    });

    expect(result.current).toEqual({ touchMode: false, embedMode: true });
  });
});
