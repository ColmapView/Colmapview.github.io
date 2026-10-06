import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdkSelector = 'script[src="https://accounts.google.com/gsi/client"]';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('google', undefined);
  vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '123456-client.apps.googleusercontent.com');
});
afterEach(() => {
  document.querySelectorAll(sdkSelector).forEach(script => script.remove());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('Google authorization library loading', () => {
  it('rejects disabled hosts before consulting an existing SDK or inserting a script', async () => {
    vi.stubGlobal('location', { origin: 'https://opsiclear.github.io' });
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
    vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', 'https://colmapview.opsiclear.com');
    const sdk = { initTokenClient: vi.fn() };
    vi.stubGlobal('google', { accounts: { oauth2: sdk } });
    const { loadGoogleOAuthSdk } = await import('./auth');
    await expect(loadGoogleOAuthSdk()).rejects.toThrow('available at https://colmapview.opsiclear.com');
    expect(document.querySelector(sdkSelector)).toBeNull();
    expect(sdk.initTokenClient).not.toHaveBeenCalled();
  });

  it('does not insert a script with missing sign-in configuration or an explicit disabled flag', async () => {
    const { loadGoogleOAuthSdk } = await import('./auth');
    vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', 'invalid');
    await expect(loadGoogleOAuthSdk()).rejects.toThrow('not configured');
    vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '123456-client.apps.googleusercontent.com');
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'false');
    await expect(loadGoogleOAuthSdk()).rejects.toThrow('available at');
    expect(document.querySelector(sdkSelector)).toBeNull();
  });

  it('uses the official script without requiring CORS response headers and shares concurrent loads', async () => {
    const { loadGoogleOAuthSdk } = await import('./auth');
    const first = loadGoogleOAuthSdk();
    expect(loadGoogleOAuthSdk()).toBe(first);
    const script = document.querySelector<HTMLScriptElement>(sdkSelector)!;
    expect(script).not.toBeNull();
    expect(script.async).toBe(true);
    expect(script.hasAttribute('crossorigin')).toBe(false);
    const sdk = { initTokenClient: vi.fn() };
    vi.stubGlobal('google', { accounts: { oauth2: sdk } });
    script.dispatchEvent(new Event('load'));
    expect(await first).toBe(sdk);
  });

  it('allows another attempt after a network failure', async () => {
    const { loadGoogleOAuthSdk } = await import('./auth');
    const failed = loadGoogleOAuthSdk();
    const rejection = expect(failed).rejects.toThrow('Could not load Google sign-in');
    document.querySelector(sdkSelector)!.dispatchEvent(new Event('error'));
    await rejection;
    expect(document.querySelector(sdkSelector)).toBeNull();

    const retry = loadGoogleOAuthSdk();
    const sdk = { initTokenClient: vi.fn() };
    vi.stubGlobal('google', { accounts: { oauth2: sdk } });
    document.querySelector(sdkSelector)!.dispatchEvent(new Event('load'));
    expect(await retry).toBe(sdk);
  });

  it('times out without leaving a stale script or pending promise', async () => {
    const { loadGoogleOAuthSdk } = await import('./auth');
    const pending = loadGoogleOAuthSdk();
    const rejection = expect(pending).rejects.toThrow('Could not load Google sign-in');
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    expect(document.querySelector(sdkSelector)).toBeNull();
  });

  it('reuses an already available SDK without inserting a script', async () => {
    const sdk = { initTokenClient: vi.fn() };
    vi.stubGlobal('google', { accounts: { oauth2: sdk } });
    const { loadGoogleOAuthSdk } = await import('./auth');
    expect(await loadGoogleOAuthSdk()).toBe(sdk);
    expect(document.querySelector(sdkSelector)).toBeNull();
  });
});
