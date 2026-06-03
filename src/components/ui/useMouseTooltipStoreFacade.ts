import { useUIStore } from '../../store/stores/uiStore';

export interface MouseTooltipStoreFacade {
  touchMode: ReturnType<typeof useUIStore.getState>['touchMode'];
}

export function useMouseTooltipStoreFacade(): MouseTooltipStoreFacade {
  const touchMode = useUIStore((s) => s.touchMode);

  return { touchMode };
}
