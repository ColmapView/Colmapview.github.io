import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubGoogleDriveHost } from '../../test/googleDriveHosting';
import { createGoogleDriveAuth, GOOGLE_DRIVE_SCOPE, GOOGLE_DRIVE_INSTALL_SCOPE, type GoogleOAuthSdk, type GoogleTokenResponse } from './auth';

function testSdk() {
  const callbacks: Parameters<GoogleOAuthSdk['initTokenClient']>[0][] = [];
  const requestAccessToken = vi.fn();
  const sdk = { initTokenClient: vi.fn(config => { callbacks.push(config); return { requestAccessToken }; }) } satisfies GoogleOAuthSdk;
  return { sdk, callbacks, requestAccessToken };
}
const validToken: GoogleTokenResponse = { access_token: 'private-test-token', token_type: 'Bearer', expires_in: 3600, scope: GOOGLE_DRIVE_SCOPE };

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Google Drive in-memory account session', () => {
  it('requests menu registration only for installation and requires that grant', () => {
    const auth = createGoogleDriveAuth();
    const { sdk, callbacks } = testSdk();
    auth.connect('123456-client.apps.googleusercontent.com', sdk, { install: true });
    expect(callbacks[0].scope).toBe(`${GOOGLE_DRIVE_SCOPE} ${GOOGLE_DRIVE_INSTALL_SCOPE}`);
    callbacks[0].callback(validToken);
    expect(auth.getSnapshot()).toMatchObject({ status: 'disconnected', error: expect.stringContaining('add ColmapView') });
    auth.connect('123456-client.apps.googleusercontent.com', sdk, { install: true });
    callbacks[1].callback({ ...validToken, scope: `${GOOGLE_DRIVE_SCOPE} ${GOOGLE_DRIVE_INSTALL_SCOPE}` });
    expect(auth.getSnapshot().status).toBe('connected');
    auth.disconnect();
  });
  it('uses the launching Drive account as a sign-in hint without requesting installation', () => {
    const auth = createGoogleDriveAuth();
    const { sdk, callbacks, requestAccessToken } = testSdk();
    auth.connect('123456-client.apps.googleusercontent.com', sdk, { loginHint: '123456789' });
    expect(callbacks[0]).toMatchObject({ login_hint: '123456789', scope: GOOGLE_DRIVE_SCOPE, include_granted_scopes: false });
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: '' });
    expect(auth.getAccessToken()).toBeNull();
    auth.disconnect();
    callbacks[0].callback(validToken);
    expect(auth.getAccessToken()).toBeNull();
  });
  it('does not initiate per-file authorization on a disabled host with an injected SDK', () => {
    stubGoogleDriveHost('https://opsiclear.github.io');
    const { sdk, requestAccessToken } = testSdk();
    const auth = createGoogleDriveAuth();
    auth.connect('123456-client.apps.googleusercontent.com', sdk);
    expect(auth.getSnapshot()).toMatchObject({ status: 'disconnected', error: expect.stringContaining('available at') });
    expect(auth.getAccessToken()).toBeNull();
    expect(sdk.initTokenClient).not.toHaveBeenCalled();
    expect(requestAccessToken).not.toHaveBeenCalled();
  });
  it('rejects invalid clients and discards grants after the capability is disabled', () => {
    const auth = createGoogleDriveAuth();
    const { sdk, callbacks } = testSdk();
    auth.connect('invalid-client', sdk);
    expect(sdk.initTokenClient).not.toHaveBeenCalled();
    auth.connect('123456-client.apps.googleusercontent.com', sdk);
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'false');
    callbacks[0].callback(validToken);
    expect(auth.getAccessToken()).toBeNull();
    expect(auth.getSnapshot().status).toBe('disconnected');
  });
  it('requires the configured production OAuth client on the exact enabled host', () => {
    stubGoogleDriveHost('https://colmapview.opsiclear.com', { production: true });
    vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '');
    const auth = createGoogleDriveAuth();
    const { sdk, callbacks } = testSdk();
    auth.connect('123456-client.apps.googleusercontent.com', sdk);
    expect(sdk.initTokenClient).not.toHaveBeenCalled();
    vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '123456-client.apps.googleusercontent.com');
    auth.connect('123456-other.apps.googleusercontent.com', sdk);
    expect(sdk.initTokenClient).not.toHaveBeenCalled();
    auth.connect('123456-client.apps.googleusercontent.com', sdk);
    callbacks[0].callback(validToken);
    expect(auth.getAccessToken()).toBe('private-test-token');
    auth.disconnect();
  });

  it('rejects a broad read-only grant instead of selected-file access', () => {
    const writer = createGoogleDriveAuth();
    const { sdk, callbacks } = testSdk();
    writer.connect('123456-client.apps.googleusercontent.com', sdk);
    callbacks[0].callback({ ...validToken, scope: 'https://www.googleapis.com/auth/drive.readonly' });
    expect(writer.getSnapshot()).toMatchObject({ status: 'disconnected', error: expect.stringContaining('file permission') });
    expect(writer.getAccessToken()).toBeNull();
  });
  it('requests selected-file access explicitly and keeps tokens out of snapshots and storage', () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const auth = createGoogleDriveAuth();
    const { sdk, callbacks, requestAccessToken } = testSdk();
    auth.connect('123456-client.apps.googleusercontent.com', sdk);
    expect(callbacks[0]).toMatchObject({ client_id: '123456-client.apps.googleusercontent.com', scope: GOOGLE_DRIVE_SCOPE, include_granted_scopes: false });
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: 'select_account' });
    callbacks[0].callback(validToken);
    expect(auth.getSnapshot()).toEqual({ status: 'connected', error: null });
    expect(auth.getAccessToken()).toBe('private-test-token');
    expect(JSON.stringify(auth.getSnapshot())).not.toContain('private-test-token');
    expect(storage).not.toHaveBeenCalled();
    auth.disconnect();
    expect(auth.getAccessToken()).toBeNull();
  });
  it('ignores delayed callbacks after disconnect and while a different attempt is pending', () => {
    const auth = createGoogleDriveAuth();
    const { sdk, callbacks } = testSdk();
    auth.connect('123456-client.apps.googleusercontent.com', sdk);
    auth.disconnect();
    auth.connect('123456-client.apps.googleusercontent.com', sdk);
    callbacks[0].callback(validToken);
    callbacks[0].error_callback({ type: 'popup_closed' });
    expect(auth.getSnapshot().status).toBe('connecting');
    callbacks[1].callback(validToken);
    callbacks[1].error_callback({ type: 'popup_closed' });
    expect(auth.getSnapshot().status).toBe('connected');
    auth.disconnect();
  });
  it.each([
    { ...validToken, scope: 'openid profile' }, { ...validToken, expires_in: 0 },
    { ...validToken, access_token: undefined }, { ...validToken, token_type: 'wrong' },
    { ...validToken, scope: 'https://www.googleapis.com/auth/drive.readonly' },
  ])('rejects unusable grants', response => {
    const auth = createGoogleDriveAuth();
    const { sdk, callbacks } = testSdk();
    auth.connect('123456-client.apps.googleusercontent.com', sdk);
    callbacks[0].callback(response);
    expect(auth.getSnapshot()).toMatchObject({ status: 'disconnected', error: expect.stringContaining('permission') });
    expect(auth.getAccessToken()).toBeNull();
  });
  it('handles denial, closed and blocked popups without exposing provider details', () => {
    const auth = createGoogleDriveAuth();
    const { sdk, callbacks } = testSdk();
    auth.connect('123456-client.apps.googleusercontent.com', sdk);
    callbacks[0].callback({ error: 'access_denied' });
    expect(auth.getSnapshot().error).toContain('declined');
    auth.connect('123456-client.apps.googleusercontent.com', sdk);
    callbacks[1].error_callback({ type: 'popup_failed_to_open' });
    expect(auth.getSnapshot().error).toContain('Allow');
    auth.connect('123456-client.apps.googleusercontent.com', sdk);
    callbacks[2].error_callback({ type: 'popup_closed' });
    expect(auth.getSnapshot().error).toContain('closed');
  });
  it('expires tokens and pending authorization attempts without automatic sign-in', () => {
    vi.useFakeTimers();
    const auth = createGoogleDriveAuth();
    const { sdk, callbacks } = testSdk();
    auth.connect('123456-client.apps.googleusercontent.com', sdk);
    callbacks[0].callback({ ...validToken, expires_in: 60 });
    vi.advanceTimersByTime(55000);
    expect(auth.getAccessToken()).toBeNull();
    expect(auth.getSnapshot().error).toContain('expired');
    auth.connect('123456-client.apps.googleusercontent.com', sdk);
    vi.advanceTimersByTime(180000);
    callbacks[1].callback(validToken);
    expect(auth.getSnapshot()).toMatchObject({ status: 'disconnected', error: expect.stringContaining('timed out') });
  });
  it('expires only the session holding a rejected token, sparing a sign-in that is pending or newer', () => {
    const auth = createGoogleDriveAuth();
    const { sdk, callbacks } = testSdk();
    auth.connect('123456-client.apps.googleusercontent.com', sdk);
    callbacks[0].callback({ ...validToken, access_token: 'older-token' });
    auth.connect('123456-client.apps.googleusercontent.com', sdk);
    auth.expire('older-token');
    expect(auth.getSnapshot()).toEqual({ status: 'connecting', error: null });
    callbacks[1].callback({ ...validToken, access_token: 'newer-token' });
    auth.expire('older-token');
    expect(auth.getSnapshot()).toEqual({ status: 'connected', error: null });
    expect(auth.getAccessToken()).toBe('newer-token');
    auth.expire('newer-token');
    expect(auth.getSnapshot()).toEqual({ status: 'disconnected', error: 'Google Drive sign-in expired. Sign in again to continue.' });
    expect(auth.getAccessToken()).toBeNull();
  });
});
