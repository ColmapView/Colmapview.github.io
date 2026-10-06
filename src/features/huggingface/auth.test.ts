import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { resolveHfConfig } from './config';
import { createHfAuth, exchangeOAuthCode, HF_CALLBACK_TYPE, HF_READ_SCOPES, HF_SCOPES, validateOAuthCallback } from './auth';
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

  it('validates and exchanges the registered extensionless custom callback without rewriting its path', async () => {
    const customConfig = { ...config, redirectUri: 'https://colmapview.opsiclear.com/hf-callback', readOnly: true };
    const customState = JSON.stringify({ state: 'transaction', nonce: 'nonce', redirectUri: customConfig.redirectUri });
    const customCallback = `${customConfig.redirectUri}?${new URLSearchParams({ code: 'custom-code', state: customState })}`;
    const data = { type: HF_CALLBACK_TYPE, url: customCallback };
    expect(validateOAuthCallback(data, customConfig.redirectUri, customState)).toBe(customCallback);
    for (const tampered of [
      customCallback.replace('/hf-callback?', '/hf-callback.html?'),
      customCallback.replace('/hf-callback?', '/other?'),
      customCallback.replace('colmapview.opsiclear.com', 'colmapview.github.io'),
      customCallback + '&state=other',
      customCallback + '#fragment',
    ]) {
      expect(validateOAuthCallback({ ...data, url: tampered }, customConfig.redirectUri, customState)).toBeNull();
    }
    expect(validateOAuthCallback(data, customConfig.redirectUri, 'another-state')).toBeNull();
    const request = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-read', expires_in: 60, scope: HF_READ_SCOPES }))
      .mockResolvedValueOnce(Response.json({ preferred_username: 'reader' }));
    vi.stubGlobal('fetch', request);
    await expect(exchangeOAuthCode(customConfig, customCallback, { nonce: 'nonce', codeVerifier: 'test-verifier' },
      new AbortController().signal)).resolves.toMatchObject({ identity: { username: 'reader' }, canPublish: false });
    expect(request.mock.calls[0][1].body.get('redirect_uri')).toBe(customConfig.redirectUri);
    expect(request.mock.calls[0][1].body.get('code')).toBe('custom-code');
  });

  it.each([
    { actualPath: '/hf-callback', registeredPath: '/hf-callback', valid: true },
    { actualPath: '/hf-callback', registeredPath: '/hf-callback.html', valid: false },
    { actualPath: '/hf-callback.html', registeredPath: '/hf-callback', valid: false },
    { actualPath: '/other', registeredPath: '/hf-callback', valid: false },
  ])('the deployed callback page delivers only the exact registered path ($actualPath → $registeredPath)', ({ actualPath, registeredPath, valid }) => {
    const origin = 'https://colmapview.opsiclear.com';
    const transaction = '12345678-1234-4123-8123-123456789abc';
    const registeredUri = origin + registeredPath;
    const expectedState = JSON.stringify({ state: transaction, nonce: 'nonce', redirectUri: registeredUri });
    const href = `${origin}${actualPath}?${new URLSearchParams({ code: 'test-code', state: expectedState })}`;
    const status = { textContent: '' };
    const postMessage = vi.fn();
    const broadcast = vi.fn();
    const replaceState = vi.fn();
    const callbackHtml = readFileSync(resolve('public/hf-callback.html'), 'utf8');
    const script = callbackHtml.match(/<script src="([^"]+)" defer><\/script>/)?.[1];
    expect(script).toBeDefined();
    expect(new URL(script!, href).href).toBe(`${origin}/hf-callback.js`);
    const callbackScript = readFileSync(resolve('public/hf-callback.js'), 'utf8');
    runInNewContext(callbackScript, {
      URL,
      window: { location: { href, origin, pathname: actualPath }, history: { replaceState }, opener: { postMessage } },
      document: { getElementById: () => status },
      BroadcastChannel: class { constructor(name: string) { broadcast(name); } postMessage = broadcast; close = vi.fn(); },
      setTimeout: vi.fn(),
    });
    expect(replaceState).toHaveBeenCalledWith(null, '', actualPath);
    if (valid) {
      const message = { type: HF_CALLBACK_TYPE, url: href };
      expect(postMessage).toHaveBeenCalledExactlyOnceWith(message, origin);
      expect(broadcast).toHaveBeenCalledWith(`colmapview-hf-${transaction}`);
      expect(broadcast).toHaveBeenCalledWith(message);
      expect(validateOAuthCallback(postMessage.mock.calls[0][0], registeredUri, expectedState)).toBe(href);
      expect(status.textContent).toContain('Return to ColmapView to finish connecting');
    } else {
      expect(postMessage).not.toHaveBeenCalled();
      expect(broadcast).not.toHaveBeenCalled();
      expect(status.textContent).toContain('Sign-in could not complete');
    }
  });

  it('exchanges PKCE with a public client_id and omits cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-access', expires_in: 3600, scope: HF_SCOPES }))
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

  it('requires repository read permission, and permits read-only sign-in without publication permission', async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test', expires_in: 60, scope: 'contribute-repos' }))
      .mockResolvedValueOnce(Response.json({ access_token: 'test', expires_in: 60, scope: HF_READ_SCOPES }))
      .mockResolvedValueOnce(Response.json({ preferred_username: 'reader' }))
      .mockResolvedValueOnce(Response.json({ access_token: 'test', expires_in: 60, scope: HF_READ_SCOPES }));
    vi.stubGlobal('fetch', request);
    const memory = { nonce: 'nonce', codeVerifier: 'verifier' };
    const signal = new AbortController().signal;
    await expect(exchangeOAuthCode(config, callback, memory, signal)).rejects.toThrow('read permission');
    expect(await exchangeOAuthCode({ ...config, readOnly: true }, callback, memory, signal)).toMatchObject({
      identity: { username: 'reader' }, canPublish: false,
    });
    await expect(exchangeOAuthCode(config, callback, memory, signal)).rejects.toThrow('publication permission');
  });

  it('uses only read scopes for private viewing and forgets the token on disconnect', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const popup = { location: { href: '' }, closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-read', expires_in: 60, scope: HF_READ_SCOPES }))
      .mockResolvedValueOnce(Response.json({ preferred_username: 'reader' })));
    const auth = createHfAuth();
    expect(auth.getReadAccessToken()).toBeNull();
    expect(auth.getSnapshot().error).toBeNull();
    const pending = auth.connect({ ...config, readOnly: true });
    await vi.waitFor(() => expect(popup.location.href).toContain('oauth/authorize'));
    expect(sdk.oauthLoginUrl).toHaveBeenCalledWith(expect.objectContaining({ scopes: HF_READ_SCOPES }));
    const returnedState = new URL(popup.location.href).searchParams.get('state')!;
    window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: popup as unknown as Window,
      data: { type: HF_CALLBACK_TYPE, url: `${config.redirectUri}?${new URLSearchParams({ code: 'code', state: returnedState })}` } }));
    await pending;
    expect(auth.getReadAccessToken()).toBe('test-read');
    expect(() => auth.getAccessToken('reader')).toThrow('publication');
    expect(localStorage.getItem('hf_access_token')).toBeNull();
    auth.disconnect();
    expect(auth.getReadAccessToken()).toBeNull();
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-access', expires_in: 60, scope: HF_SCOPES }))
      .mockResolvedValueOnce(Response.json({ preferred_username: 'publisher' })));
    const auth = createHfAuth(); const pending = auth.connect(config);
    await vi.waitFor(() => expect(popup.location.href).toContain('oauth/authorize'));
    const state = new URL(popup.location.href).searchParams.get('state')!;
    window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: popup as unknown as Window,
      data: { type: HF_CALLBACK_TYPE, url: `${config.redirectUri}?${new URLSearchParams({ code: 'code', state })}` } }));
    await pending;
    expect(auth.getAccessToken('publisher')).toBe('test-access');
    expect(auth.getReadAccessToken()).toBe('test-access');
    expect(() => auth.getAccessToken('another-account')).toThrow('account');
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    expect(auth.getReadAccessToken()).toBeNull();
    expect(() => auth.getAccessToken('publisher')).toThrow('Reconnect');
    expect(auth.getSnapshot().status).toBe('disconnected');
  });
});
