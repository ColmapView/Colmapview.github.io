import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../../store';
import { useGlobalContextMenuStoreFacade } from './useGlobalContextMenuStoreFacade';

describe('useGlobalContextMenuStoreFacade', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects global context menu state from the UI store', () => {
    useUIStore.setState({
      contextMenuPosition: { x: 12, y: 24 },
      contextMenuActions: ['resetView', 'toggleBackground'],
      showContextMenuEditor: true,
      galleryCollapsed: true,
    });

    const { result } = renderHook(() => useGlobalContextMenuStoreFacade());

    expect(result.current.data).toEqual({
      contextMenuPosition: { x: 12, y: 24 },
      contextMenuActions: ['resetView', 'toggleBackground'],
      showEditPopup: true,
      galleryCollapsed: true,
    });
  });

  it('routes context menu actions back to the UI store', () => {
    useUIStore.setState({
      contextMenuPosition: { x: 8, y: 16 },
      contextMenuActions: ['resetView'],
      showContextMenuEditor: false,
    });

    const { result } = renderHook(() => useGlobalContextMenuStoreFacade());

    act(() => {
      result.current.actions.openEditPopup();
      result.current.actions.addContextMenuAction('toggleBackground');
      result.current.actions.removeContextMenuAction('resetView');
      result.current.actions.closeContextMenuEditor();
      result.current.actions.closeContextMenu();
    });

    expect(useUIStore.getState()).toMatchObject({
      contextMenuPosition: null,
      contextMenuActions: ['toggleBackground'],
      showContextMenuEditor: false,
    });
  });
});
