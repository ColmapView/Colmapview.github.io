import { notificationStyles } from '../../theme/componentStyles';
import type { Notification } from '../../store/stores/notificationStore';

export const NOTIFICATION_EXIT_DELAY_MS = 200;

/** A phone shows the newest two; older ones surface as those close. */
export const TOUCH_MAX_VISIBLE_NOTIFICATIONS = 2;

export function getVisibleNotifications(notifications: Notification[], touchMode: boolean): Notification[] {
  return touchMode ? notifications.slice(-TOUCH_MAX_VISIBLE_NOTIFICATIONS) : notifications;
}

export type NotificationIconKind = 'info' | 'warning';

export interface NotificationToastVisualState {
  iconKind: NotificationIconKind;
  iconContainerClass: string;
  animationClass: string;
}

export function shouldAutoDismissNotification({
  type,
  duration,
}: Pick<Notification, 'type' | 'duration'>): boolean {
  return type === 'info' && duration !== undefined && duration > 0;
}

export function getNotificationToastVisualState(
  type: Notification['type'],
  isExiting: boolean
): NotificationToastVisualState {
  const isInfo = type === 'info';

  return {
    iconKind: isInfo ? 'info' : 'warning',
    iconContainerClass: isInfo
      ? notificationStyles.iconContainerInfo
      : notificationStyles.iconContainerWarning,
    animationClass: isExiting
      ? notificationStyles.exiting
      : notificationStyles.entering,
  };
}
