import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../store/stores/uiStore';
import { useControlButtonStoreFacade } from './useControlButtonStoreFacade';

describe('useControlButtonStoreFacade', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects control-button interaction state from the UI store', () => {
    useUIStore.setState({
      touchMode: true,
      contextMenuPosition: { x: 10, y: 20 },
      showContextMenuEditor: false,
    });

    const { result } = renderHook(() => useControlButtonStoreFacade());

    expect(result.current).toEqual({
      touchMode: true,
      contextMenuOpen: true,
    });
  });

  it('treats the context menu editor as an open context menu', () => {
    useUIStore.setState({
      contextMenuPosition: null,
      showContextMenuEditor: true,
    });

    const { result } = renderHook(() => useControlButtonStoreFacade());

    expect(result.current.contextMenuOpen).toBe(true);
  });
});
