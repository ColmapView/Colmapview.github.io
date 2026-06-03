import { describe, expect, it } from 'vitest';
import { notificationStyles } from '../../theme/componentStyles';
import {
  getNotificationToastVisualState,
  NOTIFICATION_EXIT_DELAY_MS,
  shouldAutoDismissNotification,
} from './notificationToastPolicy';

describe('notification toast policy', () => {
  it('auto-dismisses only timed info notifications', () => {
    expect(shouldAutoDismissNotification({ type: 'info', duration: 3000 })).toBe(true);
    expect(shouldAutoDismissNotification({ type: 'info', duration: 0 })).toBe(false);
    expect(shouldAutoDismissNotification({ type: 'info', duration: undefined })).toBe(false);
    expect(shouldAutoDismissNotification({ type: 'warning', duration: 3000 })).toBe(false);
  });

  it('derives info toast visual state', () => {
    expect(getNotificationToastVisualState('info', false)).toEqual({
      iconKind: 'info',
      iconContainerClass: notificationStyles.iconContainerInfo,
      animationClass: notificationStyles.entering,
    });
  });

  it('derives warning and exiting toast visual state', () => {
    expect(getNotificationToastVisualState('warning', true)).toEqual({
      iconKind: 'warning',
      iconContainerClass: notificationStyles.iconContainerWarning,
      animationClass: notificationStyles.exiting,
    });
  });

  it('keeps the close removal delay aligned with the fade-out duration', () => {
    expect(NOTIFICATION_EXIT_DELAY_MS).toBe(200);
  });
});
