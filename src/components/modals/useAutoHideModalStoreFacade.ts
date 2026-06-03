import { useUIStore, type UIState } from '../../store';

interface AutoHideModalDataFacade {
  autoHideElements: UIState['autoHideElements'];
}

interface AutoHideModalActionsFacade {
  setAutoHideElement: UIState['setAutoHideElement'];
}

export interface AutoHideModalStoreFacade {
  data: AutoHideModalDataFacade;
  actions: AutoHideModalActionsFacade;
}

export function useAutoHideModalStoreFacade(): AutoHideModalStoreFacade {
  const autoHideElements = useUIStore((s) => s.autoHideElements);
  const setAutoHideElement = useUIStore((s) => s.setAutoHideElement);

  return {
    data: { autoHideElements },
    actions: { setAutoHideElement },
  };
}
