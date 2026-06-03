import { NOTIFICATION_MESSAGES } from '../../constants/errorMessages';
import { useNotificationStore } from '../../store/stores/notificationStore';

export function notifyModalBoundaryError(): void {
  useNotificationStore.getState().addNotification(
    'warning',
    NOTIFICATION_MESSAGES.modalError
  );
}
