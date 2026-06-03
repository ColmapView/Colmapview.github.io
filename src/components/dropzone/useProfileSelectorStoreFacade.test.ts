import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useNotificationStore } from '../../store/stores/notificationStore';
import { useProfileSelectorStoreFacade } from './useProfileSelectorStoreFacade';

describe('useProfileSelectorStoreFacade', () => {
  beforeEach(() => {
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
  });

  it('routes profile selector notifications through the notification store', () => {
    const { result } = renderHook(() => useProfileSelectorStoreFacade());

    act(() => {
      result.current.addNotification('info', 'Profile saved');
    });

    expect(useNotificationStore.getState().notifications).toMatchObject([
      {
        type: 'info',
        message: 'Profile saved',
      },
    ]);
  });
});
