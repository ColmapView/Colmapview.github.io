import { useUIStore } from '../../store';

export interface HotkeyHelpStoreFacade {
  /** Panel open state; store-owned so the status bar can open it too. */
  showHotkeyHelp: boolean;
  hotkeyHelpInitialTab: 'essentials' | 'about';
  setShowHotkeyHelp: (show: boolean) => void;
  /** Flips the panel open/closed (? / I hotkey). */
  toggleHotkeyHelp: () => void;
}

/**
 * Store facade for HotkeyHelpModal (componentStoreBoundary: components never
 * call use*Store directly). Deliberately narrow: it exposes only the shared
 * open state. The touch/embed flags and the auto-hide chrome state it used to
 * carry existed for the top-left ⓘ trigger, which the status bar's ⌨ Shortcuts
 * entry replaced. The panel itself is a modal — it never fades with the button
 * chrome, so it needs none of them.
 */
export function useHotkeyHelpStoreFacade(): HotkeyHelpStoreFacade {
  const showHotkeyHelp = useUIStore((s) => s.showHotkeyHelp);
  const hotkeyHelpInitialTab = useUIStore((s) => s.hotkeyHelpInitialTab);
  const setShowHotkeyHelp = useUIStore((s) => s.setShowHotkeyHelp);
  const toggleHotkeyHelp = useUIStore((s) => s.toggleHotkeyHelp);

  return {
    showHotkeyHelp,
    hotkeyHelpInitialTab,
    setShowHotkeyHelp,
    toggleHotkeyHelp,
  };
}
