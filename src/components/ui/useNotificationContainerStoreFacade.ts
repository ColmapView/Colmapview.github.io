import {
  useNotificationStore,
  type Notification,
} from '../../store/stores/notificationStore';
import { useUIStore } from '../../store/stores/uiStore';

export interface NotificationContainerStoreFacade {
  notifications: Notification[];
  removeNotification: (id: string) => void;
  touchMode: boolean;
}

export function useNotificationContainerStoreFacade(): NotificationContainerStoreFacade {
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  const touchMode = useUIStore((state) => state.touchMode);

  return {
    notifications,
    removeNotification,
    touchMode,
  };
}
