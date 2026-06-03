import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useGuideStore,
  useNotificationStore,
  usePointPickingStore,
} from '../../store';
import { useViewerControlHotkeyStoreFacade } from './useViewerControlHotkeyStoreFacade';

describe('useViewerControlHotkeyStoreFacade', () => {
  beforeEach(() => {
    useGuideStore.setState(useGuideStore.getInitialState(), true);
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    usePointPickingStore.setState(usePointPickingStore.getInitialState(), true);
  });

  it('reports whether point picking escape handling should be active', () => {
    const { result } = renderHook(() => useViewerControlHotkeyStoreFacade());

    expect(result.current.data.pickingModeActive).toBe(false);

    act(() => {
      usePointPickingStore.getState().setPickingMode('distance-2pt');
    });

    expect(result.current.data.pickingModeActive).toBe(true);
  });

  it('routes hotkey side effects through store actions', () => {
    useGuideStore.setState({
      tipShownCounts: {
        welcome: 2,
      },
    });
    usePointPickingStore.setState({
      pickingMode: 'normal-3pt',
      showDistanceModal: true,
      targetDistance: 12,
    });

    const { result } = renderHook(() => useViewerControlHotkeyStoreFacade());

    act(() => {
      result.current.actions.addNotification('info', 'Saved', 100);
      result.current.actions.resetGuide();
      result.current.actions.resetPicking();
    });

    expect(useNotificationStore.getState().notifications).toMatchObject([
      {
        type: 'info',
        message: 'Saved',
        duration: 100,
      },
    ]);
    expect(useGuideStore.getState().tipShownCounts).toEqual({});
    expect(usePointPickingStore.getState()).toMatchObject({
      pickingMode: 'off',
      showDistanceModal: false,
      targetDistance: null,
    });
  });
});
