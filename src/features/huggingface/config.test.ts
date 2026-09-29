import { describe, expect, it } from 'vitest';
import { resolveHfConfig, resolveHfConfiguration } from './config';

const env = {
  VITE_HF_PUBLISH_ENABLED: 'true',
  VITE_HF_OAUTH_CLIENT_ID: ' public-client ',
  VITE_HF_OAUTH_REDIRECT_URI: 'http://localhost:5173/hf-callback.html',
};

describe('Hugging Face publishing availability', () => {
  it('requires explicit enablement even when OAuth is configured', () => {
    expect(resolveHfConfiguration({ ...env, VITE_HF_PUBLISH_ENABLED: 'false' }, 'http://localhost:5173')).toEqual({ status: 'disabled' });
    expect(resolveHfConfiguration({}, 'http://localhost:5173')).toEqual({ status: 'disabled' });
  });

  it('enables publishing on the configured origin', () => {
    expect(resolveHfConfiguration(env, 'http://localhost:5173')).toEqual({
      status: 'ready', config: { clientId: 'public-client', redirectUri: env.VITE_HF_OAUTH_REDIRECT_URI },
    });
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
