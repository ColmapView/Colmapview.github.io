import { notificationStyles } from '../../theme/componentStyles';
import { NotificationToast } from './NotificationToast';
import { getVisibleNotifications } from './notificationToastPolicy';
import { useNotificationContainerStoreFacade } from './useNotificationContainerStoreFacade';

export function NotificationContainer() {
  const {
    notifications,
    removeNotification,
    touchMode,
  } = useNotificationContainerStoreFacade();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className={touchMode ? notificationStyles.touchContainer : notificationStyles.container}>
      {getVisibleNotifications(notifications, touchMode).map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onClose={removeNotification}
          compact={touchMode}
        />
      ))}
    </div>
  );
}
