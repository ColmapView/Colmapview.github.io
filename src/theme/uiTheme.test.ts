import { afterEach, expect, it, vi } from 'vitest';
import { initializeUITheme, parseUITheme, resolveUITheme, useUITheme } from './uiTheme';
import { STORAGE_KEYS, clearPersistedSettings } from '../store/migration';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); useUITheme.setState({theme:'dark'}); });
it('validates saved preferences and resolves System mode', () => {
  expect(parseUITheme('invalid')).toBe('dark');
  expect(resolveUITheme('system', true)).toBe('light');
  expect(resolveUITheme('system', false)).toBe('dark');
  expect(resolveUITheme('dark', true)).toBe('dark');
});
it('persists, applies and resets the interface preference through storage keys', () => {
  const media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  const stop = initializeUITheme();
  useUITheme.getState().setTheme('light');
  expect(document.documentElement.dataset.uiTheme).toBe('light');
  expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('light');
  useUITheme.getState().setTheme('system');
  media.matches = false;
  media.addEventListener.mock.calls[0][1]();
  expect(document.documentElement.dataset.uiTheme).toBe('dark');
  clearPersistedSettings();
  expect(localStorage.getItem(STORAGE_KEYS.theme)).toBeNull();
  stop();
  expect(media.removeEventListener).toHaveBeenCalled();
});
it('still switches when local storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(() => useUITheme.getState().setTheme('light')).not.toThrow();
  expect(useUITheme.getState().theme).toBe('light');
});
