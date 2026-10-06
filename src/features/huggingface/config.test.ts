import { describe, expect, it } from 'vitest';
import { resolveHfAccountConfiguration, resolveHfConfig, resolveHfConfiguration } from './config';

const env = {
  VITE_HF_PUBLISH_ENABLED: 'true',
  VITE_HF_OAUTH_CLIENT_ID: ' public-client ',
  VITE_HF_OAUTH_REDIRECT_URI: 'http://localhost:5173/hf-callback.html',
};

describe('Hugging Face publishing availability', () => {
  it('enables read-only private viewing without enabling publication', () => {
    const viewing = { ...env, VITE_HF_PUBLISH_ENABLED: 'false', VITE_HF_AUTH_ENABLED: 'true' };
    expect(resolveHfConfiguration(viewing, 'http://localhost:5173')).toEqual({ status: 'disabled' });
    expect(resolveHfAccountConfiguration(viewing, 'http://localhost:5173')).toEqual({
      status: 'ready', config: { clientId: 'public-client', redirectUri: env.VITE_HF_OAUTH_REDIRECT_URI, readOnly: true },
    });
    expect(resolveHfAccountConfiguration({ ...viewing, VITE_HF_AUTH_ENABLED: 'false' }, 'http://localhost:5173')).toEqual({ status: 'disabled' });
    expect(resolveHfAccountConfiguration(viewing, 'http://localhost:5188').status).toBe('unavailable');
    expect(resolveHfAccountConfiguration(env, 'http://localhost:5173')).toEqual(resolveHfConfiguration(env, 'http://localhost:5173'));
  });
  it('requires explicit enablement even when OAuth is configured', () => {
    expect(resolveHfConfiguration({ ...env, VITE_HF_PUBLISH_ENABLED: 'false' }, 'http://localhost:5173')).toEqual({ status: 'disabled' });
    expect(resolveHfConfiguration({}, 'http://localhost:5173')).toEqual({ status: 'disabled' });
  });

  it('enables publishing on the configured origin', () => {
    expect(resolveHfConfiguration(env, 'http://localhost:5173')).toEqual({
      status: 'ready', config: { clientId: 'public-client', redirectUri: env.VITE_HF_OAUTH_REDIRECT_URI },
    });
  });

  it('uses the explicitly registered extensionless callback for custom-host viewing and publishing', () => {
    const customEnv = { ...env, VITE_HF_OAUTH_REDIRECT_URI: 'https://colmapview.opsiclear.com/hf-callback' };
    const config = { clientId: 'public-client', redirectUri: customEnv.VITE_HF_OAUTH_REDIRECT_URI };
    expect(resolveHfConfiguration(customEnv, 'https://colmapview.opsiclear.com')).toEqual({ status: 'ready', config });
    expect(resolveHfAccountConfiguration({ ...customEnv, VITE_HF_PUBLISH_ENABLED: 'false', VITE_HF_AUTH_ENABLED: 'true' },
      'https://colmapview.opsiclear.com')).toEqual({ status: 'ready', config: { ...config, readOnly: true } });
    expect(resolveHfConfiguration(customEnv, 'https://colmapview.github.io')).toMatchObject({
      status: 'unavailable', viewerUrl: 'https://colmapview.opsiclear.com/',
    });
  });

  it.each([
    'https://colmapview.github.io/latest/hf-callback.html',
    'http://localhost:5173/hf-callback.html',
  ])('retains the existing exact .html callback at %s', redirectUri => {
    expect(resolveHfConfig({ ...env, VITE_HF_OAUTH_REDIRECT_URI: redirectUri }, new URL(redirectUri).origin))
      .toEqual({ clientId: 'public-client', redirectUri });
  });

  it.each([
    'https://colmapview.opsiclear.com/hf-callback.html',
    'https://colmapview.opsiclear.com/latest/hf-callback',
    'https://colmapview.opsiclear.com/hf-callback/',
    'https://colmapview.opsiclear.com/hf-callback?next=other',
    'https://colmapview.opsiclear.com/hf-callback#state',
    'https://user:password@colmapview.opsiclear.com/hf-callback',
    'http://colmapview.opsiclear.com/hf-callback',
    'https://colmapview.opsiclear.com:8443/hf-callback',
    'https://colmapview.github.io/latest/hf-callback',
    'http://localhost:5173/hf-callback',
  ])('rejects noncanonical or unsupported extensionless callback settings: %s', redirectUri => {
    expect(resolveHfConfiguration({ ...env, VITE_HF_OAUTH_REDIRECT_URI: redirectUri }, new URL(redirectUri).origin))
      .toEqual({ status: 'unavailable', message: expect.any(String) });
  });

  it.each(['http://127.0.0.1:5173', 'http://localhost:5188'])('explains an address mismatch at %s without enabling sign-in', origin => {
    expect(resolveHfConfig(env, origin)).toBeNull();
    expect(resolveHfConfiguration(env, origin)).toMatchObject({
      status: 'unavailable', viewerUrl: 'http://localhost:5173/',
      message: expect.stringContaining('http://localhost:5173'),
    });
  });

  it('preserves a deployed viewer base path in the recovery link', () => {
    expect(resolveHfConfiguration({ ...env, VITE_HF_OAUTH_REDIRECT_URI: 'https://viewer.example/latest/hf-callback.html' }, 'https://another.example')).toMatchObject({
      status: 'unavailable', viewerUrl: 'https://viewer.example/latest/',
    });
  });

  it.each([
    '', 'not a URL', 'javascript:alert(1)', 'http://example.com/hf-callback.html',
    'https://user:password@example.com/hf-callback.html',
    'http://localhost:5173/hf-callback.html?next=evil', 'http://localhost:5173/hf-callback.html#state',
    'http://localhost:5173/another.html',
  ])('does not offer a recovery link or sign-in for an invalid callback: %s', redirectUri => {
    const invalid = { ...env, VITE_HF_OAUTH_REDIRECT_URI: redirectUri };
    expect(resolveHfConfig(invalid, 'http://localhost:5173')).toBeNull();
    expect(resolveHfConfiguration(invalid, 'http://localhost:5173')).toEqual({
      status: 'unavailable', message: expect.any(String),
    });
  });

  it('reports missing public settings without treating publishing as disabled', () => {
    expect(resolveHfConfiguration({ ...env, VITE_HF_OAUTH_CLIENT_ID: ' ' }, 'http://localhost:5173')).toEqual({
      status: 'unavailable', message: expect.any(String),
    });
  });
});
