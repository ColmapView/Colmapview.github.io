import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountSessionsSupported, consumeAccountReturn, createAccountSessions } from './api';

const request = vi.fn<typeof fetch>();
const saved = { capabilities: { google: true, hf: true, bucket: true }, accounts: [{ provider: 'google', purpose: 'view', accountId: 'account-1', renewable: true }], bucket: null, expiresAt: Date.now() + 3600_000 };
const access = { accessToken: 'fixture-access', accountId: 'account-1', expiresAt: Date.now() + 3600_000, scope: 'openid https://www.googleapis.com/auth/drive.file', renewable: true };

beforeEach(() => {
  vi.stubEnv('VITE_ACCOUNT_SESSIONS_ENABLED', 'true');
  vi.stubGlobal('fetch', request); request.mockReset();
  window.history.replaceState(null, '', '/');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('browser connection sessions', () => {
  it('makes no requests on unsupported deployments', async () => {
    vi.stubEnv('VITE_ACCOUNT_SESSIONS_ENABLED', 'false');
    expect(accountSessionsSupported()).toBe(false);
    expect((await createAccountSessions().load()).capabilities.google).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('deduplicates session restoration and uses only same-origin cookies', async () => {
    request.mockResolvedValue(Response.json(saved));
    const client = createAccountSessions();
    await Promise.all([client.load(), client.load()]);
    expect(client.getSnapshot().accounts).toEqual(saved.accounts);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('/auth/session', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store', redirect: 'error' }));
  });

  it('receives short-lived access tokens without putting credentials in URLs or persistent browser storage', async () => {
    request.mockResolvedValue(Response.json({ ...access, refreshToken: 'must-not-escape' }));
    const store = vi.spyOn(Storage.prototype, 'setItem');
    const client = createAccountSessions();
    expect(await client.token('google', 'view', 'account-1')).toEqual(access);
    expect(request.mock.calls[0][0]).toBe('/auth/google/token');
    expect(request.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-ColmapView-Session': '1' }, body: JSON.stringify({ purpose: 'view', accountId: 'account-1' }) });
    expect(store).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain('fixture');
  });

  it('falls back to tab-only connections if the deployed auth service is unavailable', async () => {
    request.mockResolvedValue(new Response('<html>not configured</html>', { status: 404 }));
    expect(await createAccountSessions().load()).toMatchObject({ ready: true, capabilities: { google: false, hf: false, bucket: false } });
  });

  it('requires an explicit remember choice and keeps bucket secrets out of restored state', async () => {
    request.mockResolvedValueOnce(Response.json({ connected: true })).mockResolvedValueOnce(Response.json({ ...saved,
      bucket: { config: { baseUrl: 'https://s3.example/bucket/', region: 'auto' }, writable: false } }));
    const client = createAccountSessions();
    await client.rememberBucket({ baseUrl: 'https://s3.example/bucket/', region: 'auto' }, { accessKeyId: 'fixture-key', secretAccessKey: 'fixture-secret' }, false);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({ remember: true, writable: false });
    expect(JSON.stringify(client.getSnapshot())).not.toMatch(/fixture-key|fixture-secret/);
  });

  it('rejects a signed bucket response that points to another object or host', async () => {
    const client = createAccountSessions();
    for (const url of ['https://other.example/bucket/file.bin', 'https://s3.example/bucket/other.bin']) {
      request.mockResolvedValueOnce(Response.json({ url }));
      await expect(client.signBucket('https://s3.example/bucket/file.bin', 'GET')).rejects.toThrow('Invalid bucket authorization');
    }
  });

  it('forgets the saved provider before a subsequent session restore', async () => {
    request.mockResolvedValueOnce(Response.json(saved)).mockResolvedValueOnce(Response.json({ disconnected: true }));
    const client = createAccountSessions(); await client.load(); await client.disconnect('google');
    expect(client.getSnapshot().accounts).toEqual([]);
    expect(request.mock.calls[1][0]).toBe('/auth/google/disconnect');
  });

  it('drops an expired server connection so a new sign-in can ask for authorization again', async () => {
    request.mockResolvedValueOnce(Response.json(saved)).mockResolvedValueOnce(Response.json({ error: 'Reconnect this account.' }, { status: 401 }));
    const client = createAccountSessions(); await client.load();
    await expect(client.token('google')).rejects.toMatchObject({ status: 401 });
    expect(client.getSnapshot().accounts).toEqual([]);
  });

  it('accepts popup completion only from this origin, popup and transaction', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const popup = { location: { href: '' }, close: vi.fn(), closed: false };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const transactionId = 'A'.repeat(43);
    request.mockImplementation(async path => String(path).endsWith('/connect')
      ? Response.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=fixture', transactionId })
      : String(path).endsWith('/token') ? Response.json(access) : Response.json(saved));
    const client = createAccountSessions(); const pending = client.connect('google');
    await vi.waitFor(() => expect(popup.location.href).toContain('accounts.google.com'));
    const data = { type: 'colmapview:account-session:v1', provider: 'google', transactionId };
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://other.example', source: popup as unknown as Window, data }));
    window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: window, data }));
    window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: popup as unknown as Window, data: { ...data, transactionId: 'B'.repeat(43) } }));
    expect(request).toHaveBeenCalledOnce();
    window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: popup as unknown as Window, data }));
    expect(await pending).toEqual(access); expect(popup.close).toHaveBeenCalled();
  });

  it('cancels the exact server attempt when a popup sign-in is abandoned', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const popup = { location: { href: '' }, close: vi.fn(), closed: false };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const transactionId = 'A'.repeat(43);
    request.mockResolvedValueOnce(Response.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth', transactionId }))
      .mockResolvedValueOnce(Response.json({ cancelled: true }));
    const controller = new AbortController();
    const pending = createAccountSessions().connect('google', {}, controller.signal);
    const failure = expect(pending).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(popup.location.href).toContain('accounts.google.com'));
    controller.abort(); await failure;
    expect(request.mock.calls[1][0]).toBe('/auth/google/cancel');
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({ transactionId });
  });

  it('consumes callback results once and preserves the dataset URL and viewer fragment', () => {
    window.history.replaceState(null, '', '/?url=https%3A%2F%2Fexample.org%2Fscene.zip&account_provider=google&account_result=cancelled#camera=2');
    expect(consumeAccountReturn()).toEqual({ provider: 'google', failed: true });
    expect(new URLSearchParams(window.location.search).get('url')).toBe('https://example.org/scene.zip');
    expect(window.location.hash).toBe('#camera=2');
    expect(consumeAccountReturn()).toBeNull();
  });
});
