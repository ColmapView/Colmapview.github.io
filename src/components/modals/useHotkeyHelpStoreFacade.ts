import { useUIStore } from '../../store';

export interface HotkeyHelpStoreFacade {
  touchMode: boolean;
  embedMode: boolean;
  /** Whether the 'buttons' chrome participates in auto-hide. */
  autoHideButtons: boolean;
  isIdle: boolean;
  showAutoHideEditor: boolean;
}

/**
 * Store facade for HotkeyHelpModal (componentStoreBoundary: components never
 * call use*Store directly). Exposes the flags that gate the info button and
 * the auto-hide chrome state that fades it when the viewer goes idle.
 */
export function useHotkeyHelpStoreFacade(): HotkeyHelpStoreFacade {
  const touchMode = useUIStore((s) => s.touchMode);
  const embedMode = useUIStore((s) => s.embedMode);
  const autoHideButtons = useUIStore((s) => s.autoHideElements.buttons);
  const isIdle = useUIStore((s) => s.isIdle);
  const showAutoHideEditor = useUIStore((s) => s.showAutoHideEditor);

  return { touchMode, embedMode, autoHideButtons, isIdle, showAutoHideEditor };
}
