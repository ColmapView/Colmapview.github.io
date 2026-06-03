import { useNotificationStore } from '../../store/stores/notificationStore';

export interface ProfileSelectorStoreFacade {
  addNotification: ReturnType<typeof useNotificationStore.getState>['addNotification'];
}

export function useProfileSelectorStoreFacade(): ProfileSelectorStoreFacade {
  const addNotification = useNotificationStore((s) => s.addNotification);

  return { addNotification };
}
