import { useNotificationStore } from '../../store/stores/notificationStore';
import { notificationStyles } from '../../theme/componentStyles';
import { NotificationToast } from './NotificationToast';

export function NotificationContainer() {
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className={notificationStyles.container}>
      {notifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onClose={removeNotification}
        />
      ))}
    </div>
  );
}
