import { useUIStore } from '../../store';

export interface HotkeyHelpStoreFacade {
  touchMode: boolean;
  embedMode: boolean;
}

/**
 * Store facade for HotkeyHelpModal (componentStoreBoundary: components never
 * call use*Store directly). Exposes the two flags that gate the info button.
 */
export function useHotkeyHelpStoreFacade(): HotkeyHelpStoreFacade {
  const touchMode = useUIStore((s) => s.touchMode);
  const embedMode = useUIStore((s) => s.embedMode);

  return { touchMode, embedMode };
}
