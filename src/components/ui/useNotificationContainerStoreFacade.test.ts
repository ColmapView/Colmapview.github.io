import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useNotificationStore } from '../../store/stores/notificationStore';
import { useNotificationContainerStoreFacade } from './useNotificationContainerStoreFacade';

describe('useNotificationContainerStoreFacade', () => {
  beforeEach(() => {
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
  });

  it('collects notifications and routes removals', () => {
    let id = '';
    act(() => {
      id = useNotificationStore.getState().addNotification('info', 'Saved');
    });

    const { result } = renderHook(() => useNotificationContainerStoreFacade());

    expect(result.current.notifications).toMatchObject([
      {
        id,
        type: 'info',
        message: 'Saved',
      },
    ]);

    act(() => {
      result.current.removeNotification(id);
    });

    expect(useNotificationStore.getState().notifications).toEqual([]);
  });
});
