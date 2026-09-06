import { create } from 'zustand';
import { STORAGE_KEYS } from '../store/migration';

export type UITheme = 'dark' | 'light' | 'system';
export function parseUITheme(value: unknown): UITheme {
  return value === 'light' || value === 'system' ? value : 'dark';
}
export function resolveUITheme(theme: UITheme, prefersLight: boolean): 'dark' | 'light' {
  return theme === 'system' ? (prefersLight ? 'light' : 'dark') : theme;
}
function readTheme(): UITheme {
  try { return parseUITheme(localStorage.getItem(STORAGE_KEYS.theme)); }
  catch { return 'dark'; }
}
export const useUITheme = create<{ theme: UITheme; setTheme: (theme: UITheme) => void }>((set) => ({
  theme: readTheme(),
  setTheme: (theme) => {
    const next = parseUITheme(theme);
    try { localStorage.setItem(STORAGE_KEYS.theme, next); } catch { /* Session theme still works without storage. */ }
    set({ theme: next });
  },
}));

/** Apply before React mounts, and follow system changes only in System mode. */
export function initializeUITheme(): () => void {
  const media = window.matchMedia('(prefers-color-scheme: light)');
  const apply = () => {
    document.documentElement.dataset.uiTheme = resolveUITheme(useUITheme.getState().theme, media.matches);
  };
  const sync = (event: StorageEvent) => {
    if (event.key === STORAGE_KEYS.theme || event.key === null) useUITheme.setState({ theme: readTheme() });
  };
  apply();
  const unsubscribe = useUITheme.subscribe(apply);
  media.addEventListener('change', apply);
  window.addEventListener('storage', sync);
  return () => {
    unsubscribe();
    media.removeEventListener('change', apply);
    window.removeEventListener('storage', sync);
  };
}
