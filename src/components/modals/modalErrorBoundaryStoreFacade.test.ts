import { beforeEach, describe, expect, it } from 'vitest';
import { NOTIFICATION_MESSAGES } from '../../constants/errorMessages';
import { useNotificationStore } from '../../store';
import { notifyModalBoundaryError } from './modalErrorBoundaryStoreFacade';

describe('modalErrorBoundaryStoreFacade', () => {
  beforeEach(() => {
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
  });

  it('routes modal boundary errors to the notification store', () => {
    notifyModalBoundaryError();

    expect(useNotificationStore.getState().notifications).toMatchObject([
      {
        type: 'warning',
        message: NOTIFICATION_MESSAGES.modalError,
      },
    ]);
  });
});
