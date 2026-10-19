import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountSessions, type AccountSessionState, type SessionToken } from './api';
import { createGoogleDriveAuth, GOOGLE_DRIVE_SCOPE } from '../googleDrive/auth';
import { createHfAuth } from '../huggingface/auth';

const saved = vi.hoisted(() => ({ ready: true, capabilities: { google: true, hf: true, bucket: true },
  accounts: [{ provider: 'google', purpose: 'view', accountId: 'google-account', renewable: true },
    { provider: 'hf', purpose: 'view', accountId: 'hf-account', username: 'fixture-owner', renewable: true },
    { provider: 'hf', purpose: 'publish', accountId: 'hf-account', username: 'fixture-owner', renewable: true }], bucket: null, expiresAt: 0 }));
vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(),
  accountSessions: { getSnapshot: () => saved as AccountSessionState, token: vi.fn(), disconnect: vi.fn().mockResolvedValue(undefined), connect: vi.fn() } }));
const googleToken = (): SessionToken => ({ accessToken: 'google-access', expiresAt: Date.now() + 3600_000,
  accountId: 'google-account', scope: `openid ${GOOGLE_DRIVE_SCOPE}`, renewable: true });
const hfToken = (publish = false): SessionToken => ({ accessToken: publish ? 'hf-publish' : 'hf-read', expiresAt: Date.now() + 3600_000,
  accountId: 'hf-account', username: 'fixture-owner', scope: `openid profile read-repos${publish ? ' contribute-repos' : ''}`, renewable: true });

beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
  vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', '');
  vi.mocked(accountSessions.token).mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('provider session restoration', () => {
  it('renews a remembered Drive connection for the same account without loading the SDK', async () => {
    vi.useFakeTimers();
    const auth = createGoogleDriveAuth();
    vi.mocked(accountSessions.token).mockResolvedValueOnce(googleToken());
    expect(await auth.restore('google-account')).toBe(true);
    await vi.advanceTimersByTimeAsync(3600_000);
    vi.mocked(accountSessions.token).mockResolvedValueOnce({ ...googleToken(), accessToken: 'renewed-google' });
    expect(await auth.ensureAccessToken()).toBe('renewed-google');
    expect(accountSessions.token).toHaveBeenLastCalledWith('google', 'view', 'google-account');
    auth.disconnect();
  });

  it('does not accept a restoration completed after Drive disconnect', async () => {
    let resolve!: (value: SessionToken) => void;
    vi.mocked(accountSessions.token).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const auth = createGoogleDriveAuth();
    const pending = auth.restore('google-account'); auth.disconnect(); resolve(googleToken());
    expect(await pending).toBe(false); expect(auth.getAccessToken()).toBeNull();
    expect(accountSessions.disconnect).toHaveBeenCalledWith('google');
  });

  it('restores HF reading separately and uses saved publication permission only for publishing', async () => {
    const auth = createHfAuth();
    vi.mocked(accountSessions.token).mockResolvedValueOnce(hfToken());
    expect(await auth.restore()).toBe(true);
    expect(auth.getReadAccessToken()).toBe('hf-read'); expect(auth.canPublish()).toBe(false);
    expect(accountSessions.token).toHaveBeenLastCalledWith('hf', 'view');
    expect(() => auth.getAccessToken()).toThrow('publishing dialog');
    vi.mocked(accountSessions.token).mockResolvedValueOnce(hfToken(true));
    expect(await auth.ensureAccessToken('fixture-owner')).toBe('hf-publish');
    expect(accountSessions.token).toHaveBeenLastCalledWith('hf', 'publish');
    await expect(auth.ensureAccessToken('another-owner')).rejects.toThrow('account that started');
    auth.disconnect();
  });

  it('reuses an existing HF publishing connection for reading when no separate read connection exists', async () => {
    const original = saved.accounts;
    saved.accounts = original.filter(account => account.provider !== 'hf' || account.purpose !== 'view');
    try {
      const auth = createHfAuth();
      vi.mocked(accountSessions.token).mockResolvedValueOnce(hfToken(true));
      expect(await auth.restore()).toBe(true);
      expect(auth.getReadAccessToken()).toBe('hf-publish');
      expect(accountSessions.token).toHaveBeenLastCalledWith('hf', 'publish');
      expect(accountSessions.connect).not.toHaveBeenCalled();
      auth.disconnect();
    } finally { saved.accounts = original; }
  });

  it('does not accept a restored HF account after disconnect', async () => {
    let resolve!: (value: SessionToken) => void;
    vi.mocked(accountSessions.token).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const auth = createHfAuth(); const pending = auth.restore(); auth.disconnect(); resolve(hfToken());
    expect(await pending).toBe(false); expect(auth.getReadAccessToken()).toBeNull();
    expect(accountSessions.disconnect).toHaveBeenCalledWith('hf');
  });

  it('asks the server to renew a rejected Google token even before its declared expiry', async () => {
    const auth = createGoogleDriveAuth();
    vi.mocked(accountSessions.token).mockResolvedValueOnce(googleToken()); await auth.restore('google-account');
    auth.expire('google-access');
    vi.mocked(accountSessions.token).mockResolvedValueOnce({ ...googleToken(), accessToken: 'renewed-google' });
    expect(await auth.ensureAccessToken()).toBe('renewed-google');
    expect(accountSessions.token).toHaveBeenLastCalledWith('google', 'view', 'google-account', undefined, true);
    auth.disconnect();
  });

  it('asks the server to renew a rejected HF token even before its declared expiry', async () => {
    const auth = createHfAuth();
    vi.mocked(accountSessions.token).mockResolvedValueOnce(hfToken()); await auth.restore(); auth.expire();
    vi.mocked(accountSessions.token).mockResolvedValueOnce({ ...hfToken(), accessToken: 'renewed-hf' });
    expect(await auth.ensureReadAccessToken()).toBe('renewed-hf');
    expect(accountSessions.token).toHaveBeenLastCalledWith('hf', 'view', undefined, undefined, true);
    auth.disconnect();
  });
});
