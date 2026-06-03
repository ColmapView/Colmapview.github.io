import { notificationStyles } from '../../theme/componentStyles';
import { NotificationToast } from './NotificationToast';
import { useNotificationContainerStoreFacade } from './useNotificationContainerStoreFacade';

export function NotificationContainer() {
  const {
    notifications,
    removeNotification,
  } = useNotificationContainerStoreFacade();

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
