import {
  useNotificationStore,
  type Notification,
} from '../../store/stores/notificationStore';

export interface NotificationContainerStoreFacade {
  notifications: Notification[];
  removeNotification: (id: string) => void;
}

export function useNotificationContainerStoreFacade(): NotificationContainerStoreFacade {
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);

  return {
    notifications,
    removeNotification,
  };
}
