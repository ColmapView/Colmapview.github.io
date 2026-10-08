import { useNotificationStore } from '../store/stores/notificationStore';

/** The notifications on screen with this message; pinning the whole list catches a stacked duplicate. */
export function notificationsWithMessage(message: string) {
  return useNotificationStore.getState().notifications.filter(notification => notification.message === message);
}
