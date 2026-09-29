import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveHfConfig } from './config';
import { createHfAuth, exchangeOAuthCode, HF_CALLBACK_TYPE, validateOAuthCallback } from './auth';
import { publicationErrorMessage } from './http';

const config = { clientId: 'test-public-client', redirectUri: 'http://localhost/hf-callback.html' };
const state = JSON.stringify({ state: 'transaction', nonce: 'nonce', redirectUri: config.redirectUri });
const callback = `${config.redirectUri}?${new URLSearchParams({ code: 'test-code', state })}`;
const sdk = vi.hoisted(() => ({ oauthLoginUrl: vi.fn() }));
vi.mock('@huggingface/hub', () => sdk);

beforeEach(() => {
  vi.clearAllMocks();
  sdk.oauthLoginUrl.mockImplementation(async (options: { redirectUrl: string; state: string; localStorage: { nonce: string; codeVerifier: string } }) => {
    options.localStorage.nonce = 'nonce'; options.localStorage.codeVerifier = 'verifier';
    return `https://huggingface.co/oauth/authorize?${new URLSearchParams({ state: JSON.stringify({ state: options.state, nonce: 'nonce', redirectUri: options.redirectUrl }) })}`;
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('public Hugging Face OAuth', () => {
  it('requires explicit enablement and a same-origin registered callback', () => {
    const env = { VITE_HF_PUBLISH_ENABLED: 'true', VITE_HF_OAUTH_CLIENT_ID: config.clientId, VITE_HF_OAUTH_REDIRECT_URI: config.redirectUri };
    expect(resolveHfConfig(env, 'http://localhost')).toEqual(config);
    expect(resolveHfConfig({ ...env, VITE_HF_PUBLISH_ENABLED: 'false' }, 'http://localhost')).toBeNull();
    expect(resolveHfConfig(env, 'https://another.example')).toBeNull();
    expect(resolveHfConfig({ ...env, VITE_HF_OAUTH_REDIRECT_URI: config.redirectUri + '?next=evil' }, 'http://localhost')).toBeNull();
  });

  it('accepts only the exact callback and one-use state', () => {
    const data = { type: HF_CALLBACK_TYPE, url: callback };
    expect(validateOAuthCallback(data, config.redirectUri, state)).toBe(callback);
    expect(validateOAuthCallback(data, config.redirectUri, 'other-transaction')).toBeNull();
    expect(validateOAuthCallback({ ...data, url: callback.replace('localhost', 'evil.example') }, config.redirectUri, state)).toBeNull();
    expect(validateOAuthCallback({ ...data, url: callback + '&state=another' }, config.redirectUri, state)).toBeNull();
    expect(validateOAuthCallback({ ...data, url: callback.replace('hf-callback', 'other') }, config.redirectUri, state)).toBeNull();
  });

  it('exchanges PKCE with a public client_id and omits cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-access', expires_in: 3600, scope: 'openid profile contribute-repos' }))
      .mockResolvedValueOnce(Response.json({ preferred_username: 'publisher' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await exchangeOAuthCode(config, callback, { nonce: 'nonce', codeVerifier: 'test-verifier' }, new AbortController().signal);
    expect(result.identity.username).toBe('publisher');
    const init = fetchMock.mock.calls[0][1];
    expect(init.credentials).toBe('omit');
    expect(Object.fromEntries(init.body)).toEqual({ grant_type: 'authorization_code', client_id: config.clientId,
      code: 'test-code', code_verifier: 'test-verifier', redirect_uri: config.redirectUri });
    expect(init.body.has('client_secret')).toBe(false);
  });

  it('does not exchange a mismatched nonce or accept missing publication permission', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ access_token: 'test', expires_in: 60, scope: 'profile' }));
    vi.stubGlobal('fetch', request);
    await expect(exchangeOAuthCode(config, callback, { nonce: 'wrong', codeVerifier: 'verifier' }, new AbortController().signal)).rejects.toThrow('invalid');
    expect(request).not.toHaveBeenCalled();
    await expect(exchangeOAuthCode(config, callback, { nonce: 'nonce', codeVerifier: 'verifier' }, new AbortController().signal)).rejects.toThrow('permission');
  });

  it('does not surface provider request URLs or credentials in UI errors', () => {
    expect(publicationErrorMessage(new Error('Authorization: Bearer secret'))).not.toContain('secret');
  });

  it('reports a blocked popup without starting authorization', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const auth = createHfAuth(); await auth.connect(config);
    expect(auth.getSnapshot()).toMatchObject({ status: 'disconnected', error: expect.stringContaining('popup') });
    expect(sdk.oauthLoginUrl).not.toHaveBeenCalled();
  });

  it('ignores the wrong message origin or window and rejects callbacks after disconnect', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const popup = { location: { href: '' }, closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    const auth = createHfAuth(); const pending = auth.connect(config);
    await vi.waitFor(() => expect(popup.location.href).toContain('oauth/authorize'));
    const state = new URL(popup.location.href).searchParams.get('state')!;
    const data = { type: HF_CALLBACK_TYPE, url: `${config.redirectUri}?${new URLSearchParams({ code: 'code', state })}` };
    const send = (origin: string, source: Window | null) => window.dispatchEvent(new MessageEvent('message', { origin, source, data }));
    send('https://evil.example', popup as unknown as Window);
    send(window.location.origin, window);
    expect(auth.getSnapshot().status).toBe('connecting');
    expect(request).not.toHaveBeenCalled();
    auth.disconnect(); await pending;
    send(window.location.origin, popup as unknown as Window);
    expect(request).not.toHaveBeenCalled();
    expect(auth.getSnapshot().status).toBe('disconnected');
    expect(popup.close).toHaveBeenCalled();
  });

  it('forgets expired credentials and requires the publishing account on retry', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const popup = { location: { href: '' }, closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-access', expires_in: 60, scope: 'contribute-repos' }))
      .mockResolvedValueOnce(Response.json({ preferred_username: 'publisher' })));
    const auth = createHfAuth(); const pending = auth.connect(config);
    await vi.waitFor(() => expect(popup.location.href).toContain('oauth/authorize'));
    const state = new URL(popup.location.href).searchParams.get('state')!;
    window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: popup as unknown as Window,
      data: { type: HF_CALLBACK_TYPE, url: `${config.redirectUri}?${new URLSearchParams({ code: 'code', state })}` } }));
    await pending;
    expect(auth.getAccessToken('publisher')).toBe('test-access');
    expect(() => auth.getAccessToken('another-account')).toThrow('account');
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    expect(() => auth.getAccessToken('publisher')).toThrow('Reconnect');
    expect(auth.getSnapshot().status).toBe('disconnected');
  });
});
