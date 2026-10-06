import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const selector = 'script[src="https://apis.google.com/js/api.js"]';
const sdk = { PickerBuilder: class {}, DocsView: class {}, ViewId: { DOCS: 'docs' }, Action: { PICKED: 'picked', CANCEL: 'cancel', ERROR: 'error' } };

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.stubGlobal('google', undefined); vi.stubGlobal('gapi', undefined);
  vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'browser-key');
  vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '123456-client.apps.googleusercontent.com');
  vi.stubEnv('VITE_GOOGLE_DRIVE_APP_ID', '786347713663');
});
afterEach(() => {
  document.querySelectorAll(selector).forEach(script => script.remove());
  vi.unstubAllGlobals(); vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('Google Picker SDK loading', () => {
  it('never calls an available loader or reuses Picker on a disabled preview host', async () => {
    vi.stubGlobal('location', { origin: 'https://preview.colmap-webview.pages.dev' });
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
    vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', 'https://colmapview.opsiclear.com');
    const load = vi.fn();
    vi.stubGlobal('gapi', { load });
    vi.stubGlobal('google', { picker: sdk });
    const { loadGooglePickerSdk } = await import('./picker');
    await expect(loadGooglePickerSdk()).rejects.toThrow('available at https://colmapview.opsiclear.com');
    expect(load).not.toHaveBeenCalled();
    expect(document.querySelector(selector)).toBeNull();
  });

  it('does not insert a script when the numeric project number is missing', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_APP_ID', '');
    const { loadGooglePickerSdk } = await import('./picker');
    await expect(loadGooglePickerSdk()).rejects.toThrow('not configured');
    expect(document.querySelector(selector)).toBeNull();
  });

  it('shares concurrent lazy loads and preserves the separate GIS namespace', async () => {
    const oauth = { initTokenClient: vi.fn() };
    vi.stubGlobal('google', { accounts: { oauth2: oauth } });
    const { loadGooglePickerSdk } = await import('./picker');
    const first = loadGooglePickerSdk();
    expect(loadGooglePickerSdk()).toBe(first);
    const script = document.querySelector<HTMLScriptElement>(selector)!;
    expect(script.async).toBe(true);
    expect(script.hasAttribute('crossorigin')).toBe(false);
    const load = vi.fn((module, config) => {
      expect(module).toBe('picker');
      vi.stubGlobal('google', { accounts: { oauth2: oauth }, picker: sdk });
      config.callback();
    });
    vi.stubGlobal('gapi', { load });
    script.dispatchEvent(new Event('load'));
    expect(await first).toBe(sdk);
    expect((window as Window & { google?: { accounts?: { oauth2?: unknown } } }).google?.accounts?.oauth2).toBe(oauth);
    expect(load).toHaveBeenCalledOnce();
  });
  it('reuses an existing picker without loading another script', async () => {
    vi.stubGlobal('google', { picker: sdk });
    const { loadGooglePickerSdk } = await import('./picker');
    expect(await loadGooglePickerSdk()).toBe(sdk);
    expect(document.querySelector(selector)).toBeNull();
  });
  it('uses an existing API loader and ignores late callbacks from a failed attempt', async () => {
    const callbacks: { callback: () => void; onerror: () => void }[] = [];
    vi.stubGlobal('gapi', { load: vi.fn((_module, config) => callbacks.push(config)) });
    const { loadGooglePickerSdk } = await import('./picker');
    const failed = loadGooglePickerSdk();
    const rejection = expect(failed).rejects.toThrow('Could not load');
    callbacks[0].onerror();
    await rejection;
    const retry = loadGooglePickerSdk();
    callbacks[0].callback();
    expect(loadGooglePickerSdk()).toBe(retry);
    vi.stubGlobal('google', { picker: sdk });
    callbacks[1].callback();
    expect(await retry).toBe(sdk);
    expect(document.querySelector(selector)).toBeNull();
  });
  it('removes failed scripts and supports a new network attempt', async () => {
    const { loadGooglePickerSdk } = await import('./picker');
    const pending = loadGooglePickerSdk();
    const rejection = expect(pending).rejects.toThrow('Could not load');
    document.querySelector(selector)!.dispatchEvent(new Event('error'));
    await rejection;
    expect(document.querySelector(selector)).toBeNull();
    const retry = loadGooglePickerSdk();
    const retryRejection = expect(retry).rejects.toThrow('Could not load');
    await vi.advanceTimersByTimeAsync(30_000);
    await retryRejection;
    expect(document.querySelector(selector)).toBeNull();
  });
  it('recovers when the API loader throws synchronously', async () => {
    vi.stubGlobal('gapi', { load: vi.fn(() => { throw new Error('provider internals'); }) });
    const { loadGooglePickerSdk } = await import('./picker');
    await expect(loadGooglePickerSdk()).rejects.toThrow('Could not load');
    vi.stubGlobal('google', { picker: sdk });
    expect(await loadGooglePickerSdk()).toBe(sdk);
  });
});
