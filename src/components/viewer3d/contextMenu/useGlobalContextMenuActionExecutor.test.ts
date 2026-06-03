import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../../store';
import { CANVAS_COLORS } from '../../../theme';
import { useGlobalContextMenuActionExecutor } from './useGlobalContextMenuActionExecutor';

describe('useGlobalContextMenuActionExecutor', () => {
  beforeEach(() => {
    useUIStore.setState({
      backgroundColor: CANVAS_COLORS.white,
      showDeletionModal: false,
      showContextMenuEditor: false,
    });
  });

  it('routes toggle actions through store-backed dependencies without closing the menu', async () => {
    const closeContextMenu = vi.fn();
    const openEditPopup = vi.fn();
    const { result } = renderHook(() =>
      useGlobalContextMenuActionExecutor({ closeContextMenu, openEditPopup })
    );

    await act(async () => {
      await result.current('toggleBackground');
    });

    expect(useUIStore.getState().backgroundColor).toBe(CANVAS_COLORS.outline);
    expect(closeContextMenu).not.toHaveBeenCalled();
    expect(openEditPopup).not.toHaveBeenCalled();
  });

  it('routes modal actions through the facade and closes one-shot actions', async () => {
    const closeContextMenu = vi.fn();
    const openEditPopup = vi.fn();
    const { result } = renderHook(() =>
      useGlobalContextMenuActionExecutor({ closeContextMenu, openEditPopup })
    );

    await act(async () => {
      await result.current('openDeletion');
    });

    expect(useUIStore.getState().showDeletionModal).toBe(true);
    expect(closeContextMenu).toHaveBeenCalledTimes(1);
    expect(openEditPopup).not.toHaveBeenCalled();
  });

  it('keeps edit-menu opening separate from close policy', async () => {
    const closeContextMenu = vi.fn();
    const openEditPopup = vi.fn();
    const { result } = renderHook(() =>
      useGlobalContextMenuActionExecutor({ closeContextMenu, openEditPopup })
    );

    await act(async () => {
      await result.current('editMenu');
    });

    expect(openEditPopup).toHaveBeenCalledTimes(1);
    expect(closeContextMenu).not.toHaveBeenCalled();
  });
});
