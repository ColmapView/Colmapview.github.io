import {
  useGuideStore,
  useNotificationStore,
  usePointPickingStore,
  type GuideState,
  type NotificationState,
  type PointPickingState,
} from '../../store';

interface ViewerControlHotkeyDataFacade {
  pickingModeActive: boolean;
}

interface ViewerControlHotkeyActionsFacade {
  addNotification: NotificationState['addNotification'];
  resetGuide: GuideState['resetGuide'];
  resetPicking: PointPickingState['reset'];
}

export interface ViewerControlHotkeyStoreFacade {
  data: ViewerControlHotkeyDataFacade;
  actions: ViewerControlHotkeyActionsFacade;
}

export function useViewerControlHotkeyStoreFacade(): ViewerControlHotkeyStoreFacade {
  const addNotification = useNotificationStore((state) => state.addNotification);
  const resetGuide = useGuideStore((state) => state.resetGuide);
  const resetPicking = usePointPickingStore((state) => state.reset);
  const pickingModeActive = usePointPickingStore((state) => state.pickingMode) !== 'off';

  return {
    data: {
      pickingModeActive,
    },
    actions: {
      addNotification,
      resetGuide,
      resetPicking,
    },
  };
}
