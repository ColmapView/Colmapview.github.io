import { afterEach, describe, expect, it, vi } from 'vitest';
import { GOOGLE_DRIVE_ENABLED_ORIGIN, getGoogleDriveConfiguration, getGoogleDriveHostingConfig, isGoogleDriveEnabled, resolveGoogleDriveHostingConfig } from './config';

const credentials = {
  VITE_GOOGLE_DRIVE_API_KEY: 'public-browser-key',
  VITE_GOOGLE_DRIVE_CLIENT_ID: '123456-client.apps.googleusercontent.com',
  VITE_GOOGLE_DRIVE_APP_ID: '786347713663',
};
const hostedEnv = {
  ...credentials,
  VITE_GOOGLE_DRIVE_ENABLED: 'true',
  VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN: GOOGLE_DRIVE_ENABLED_ORIGIN,
};
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Google Drive deployment capability', () => {
  it('enables only the exact configured custom origin in production', () => {
    expect(resolveGoogleDriveHostingConfig({ origin: GOOGLE_DRIVE_ENABLED_ORIGIN, development: false, env: hostedEnv }))
      .toMatchObject({ enabled: true, hostAllowed: true, allowedOrigin: GOOGLE_DRIVE_ENABLED_ORIGIN });
    for (const origin of [
      'https://opsiclear.github.io', 'https://colmap-webview.pages.dev', 'https://preview.colmap-webview.pages.dev',
      'https://colmapview.opsiclear.com.evil.example', 'http://colmapview.opsiclear.com',
      'https://colmapview.opsiclear.com:8443', 'http://localhost:5173',
    ]) {
      expect(resolveGoogleDriveHostingConfig({ origin, development: false, env: hostedEnv }))
        .toMatchObject({ enabled: false, hostAllowed: false, allowedOrigin: GOOGLE_DRIVE_ENABLED_ORIGIN });
    }
  });

  it.each([undefined, '', 'false', '1', 'TRUE', 'yes'])('requires explicit true on the hosted origin (%s)', flag => {
    expect(resolveGoogleDriveHostingConfig({
      origin: GOOGLE_DRIVE_ENABLED_ORIGIN, development: false, env: { ...hostedEnv, VITE_GOOGLE_DRIVE_ENABLED: flag },
    }).enabled).toBe(false);
  });

  it.each([
    undefined, '', 'https://other.example', 'https://user:password@colmapview.opsiclear.com',
    'https://colmapview.opsiclear.com/path', 'https://colmapview.opsiclear.com?key=value',
    'https://colmapview.opsiclear.com#fragment', 'http://colmapview.opsiclear.com',
    'https://colmapview.opsiclear.com:8443', 'https://colmapview.opsiclear.com/',
  ])('fails closed for missing or non-origin allowed configuration (%s)', allowedOrigin => {
    expect(resolveGoogleDriveHostingConfig({
      origin: GOOGLE_DRIVE_ENABLED_ORIGIN, development: false,
      env: { ...hostedEnv, VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN: allowedOrigin },
    })).toMatchObject({ enabled: false, allowedOrigin: GOOGLE_DRIVE_ENABLED_ORIGIN });
  });

  it.each(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173'])('preserves configured loopback development without new flags (%s)', origin => {
    expect(resolveGoogleDriveHostingConfig({ origin, development: true, env: credentials }))
      .toMatchObject({ enabled: true, hostAllowed: true });
    expect(resolveGoogleDriveHostingConfig({ origin, development: false, env: credentials }).enabled).toBe(false);
    expect(resolveGoogleDriveHostingConfig({ origin, development: true, env: { ...credentials, VITE_GOOGLE_DRIVE_ENABLED: 'false' } }).enabled).toBe(false);
  });

  it('requires an exact explicit loopback origin when one is configured', () => {
    const origin = 'http://localhost:5173';
    expect(resolveGoogleDriveHostingConfig({ origin, development: true, env: { ...credentials, VITE_GOOGLE_DRIVE_ENABLED: 'true', VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN: origin } }))
      .toMatchObject({ enabled: true, allowedOrigin: origin });
    expect(resolveGoogleDriveHostingConfig({ origin, development: true, env: { ...credentials, VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN: 'http://localhost:5174' } }).hostAllowed).toBe(false);
    expect(resolveGoogleDriveHostingConfig({ origin: 'https://opsiclear.github.io', development: true, env: { ...hostedEnv, VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN: origin } }))
      .toMatchObject({ enabled: false, allowedOrigin: GOOGLE_DRIVE_ENABLED_ORIGIN });
  });

  it('distinguishes allowed hosts from valid action credentials without requiring Picker config for sign-in', () => {
    expect(resolveGoogleDriveHostingConfig({ origin: GOOGLE_DRIVE_ENABLED_ORIGIN, development: false, env: { ...hostedEnv, VITE_GOOGLE_DRIVE_API_KEY: '', VITE_GOOGLE_DRIVE_APP_ID: '' } }).enabled).toBe(true);
    expect(resolveGoogleDriveHostingConfig({ origin: GOOGLE_DRIVE_ENABLED_ORIGIN, development: false, env: { ...hostedEnv, VITE_GOOGLE_DRIVE_API_KEY: 'bad key', VITE_GOOGLE_DRIVE_CLIENT_ID: 'invalid' } }))
      .toMatchObject({ enabled: false, hostAllowed: true, reason: 'missing-config' });
  });

  it('gates all runtime config getters and keeps a safe hosted handoff destination', () => {
    Object.entries(credentials).forEach(([key, value]) => vi.stubEnv(key, value));
    expect(isGoogleDriveEnabled()).toBe(true);
    expect(getGoogleDriveConfiguration()).toMatchObject({ apiKey: credentials.VITE_GOOGLE_DRIVE_API_KEY, clientId: credentials.VITE_GOOGLE_DRIVE_CLIENT_ID, appId: credentials.VITE_GOOGLE_DRIVE_APP_ID });
    vi.stubGlobal('location', { origin: 'https://opsiclear.github.io' });
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
    vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', GOOGLE_DRIVE_ENABLED_ORIGIN);
    expect(isGoogleDriveEnabled()).toBe(false);
    expect(getGoogleDriveHostingConfig()).toMatchObject({ allowedOrigin: GOOGLE_DRIVE_ENABLED_ORIGIN, hostAllowed: false });
    expect(getGoogleDriveConfiguration()).toMatchObject({ apiKey: null, clientId: null, appId: null });
  });
});
