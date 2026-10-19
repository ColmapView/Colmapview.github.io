import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleDriveOpenWith } from './GoogleDriveOpenWith';
import { googleDriveAuth, loadGoogleOAuthSdk, type GoogleOAuthSdk, type GoogleTokenResponse } from '../../features/googleDrive/auth';
import { runStartupLoadPlan } from '../../appStartupLoad';
import { chooseGoogleDriveArchive } from '../../features/googleDrive/picker';
import { accountSessions } from '../../features/accountSessions/api';

const savedSessions = vi.hoisted(() => ({ ready: true, capabilities: { google: false, hf: false, bucket: false }, accounts: [], bucket: null, expiresAt: 0 }));
vi.mock('../../features/accountSessions/api', async original => ({
  ...await original<typeof import('../../features/accountSessions/api')>(),
  accountSessions: { getSnapshot: () => savedSessions, subscribe: () => () => {}, load: vi.fn(async () => savedSessions), token: vi.fn(), connectRedirect: vi.fn(), disconnect: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../features/googleDrive/auth', async original => ({
  ...await original<typeof import('../../features/googleDrive/auth')>(), loadGoogleOAuthSdk: vi.fn(),
}));
vi.mock('../../features/googleDrive/picker', async original => ({
  ...await original<typeof import('../../features/googleDrive/picker')>(), chooseGoogleDriveArchive: vi.fn(),
}));
vi.mock('../../appStartupLoad', () => ({ runStartupLoadPlan: vi.fn().mockResolvedValue(undefined) }));

const launch = '?drive=open&state=' + encodeURIComponent(JSON.stringify({
  action: 'open', ids: ['selected-file'], resourceKeys: { 'selected-file': 'resource-key' }, userId: '123456789',
}));
let callback: ((response: GoogleTokenResponse) => void) | undefined;
const requestAccessToken = vi.fn();
const sdk: GoogleOAuthSdk = { initTokenClient: vi.fn(config => { callback = config.callback; return { requestAccessToken }; }) };
const authorize = () => act(() => callback?.({ access_token: 'selected-token', token_type: 'Bearer', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' }));
const props = () => ({ loadFromUrl: vi.fn(), loadFromManifest: vi.fn(), onOpenUrlModal: vi.fn(), onLoadRemoteDataset: vi.fn() });

beforeEach(() => {
  savedSessions.capabilities.google = false;
  vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
  vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', '');
  vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-key');
  vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '123-client.apps.googleusercontent.com');
  vi.stubEnv('VITE_GOOGLE_DRIVE_APP_ID', '123');
  vi.mocked(loadGoogleOAuthSdk).mockResolvedValue(sdk);
  window.history.replaceState(null, '', launch);
});
afterEach(() => {
  cleanup(); googleDriveAuth.disconnect(); vi.unstubAllEnvs(); vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('Drive-selected archive sign-in', () => {
  it('restores the matching saved account and loads without a Google popup, Picker or an extra click', async () => {
    vi.stubEnv('VITE_ACCOUNT_SESSIONS_ENABLED', 'true');
    savedSessions.capabilities.google = true;
    vi.mocked(accountSessions.token).mockResolvedValue({ accessToken: 'saved-token', expiresAt: Date.now() + 3600_000,
      accountId: '123456789', scope: 'openid https://www.googleapis.com/auth/drive.file', renewable: true });
    const loaders = props();
    render(<StrictMode><GoogleDriveOpenWith {...loaders} /></StrictMode>);
    await waitFor(() => expect(runStartupLoadPlan).toHaveBeenCalledOnce());
    expect(accountSessions.token).toHaveBeenCalledWith('google', 'view', '123456789');
    expect(googleDriveAuth.getAccessToken()).toBe('saved-token');
    expect(requestAccessToken).not.toHaveBeenCalled();
    expect(loadGoogleOAuthSdk).not.toHaveBeenCalled();
    expect(chooseGoogleDriveArchive).not.toHaveBeenCalled();
  });
  it('starts Google authorization automatically for a fresh Drive launch, preserving the selected file and account', async () => {
    vi.stubEnv('VITE_ACCOUNT_SESSIONS_ENABLED', 'true');
    savedSessions.capabilities.google = true;
    vi.mocked(accountSessions.token).mockRejectedValue(new Error('A matching account is not connected'));
    vi.mocked(accountSessions.connectRedirect).mockResolvedValue();
    render(<StrictMode><GoogleDriveOpenWith {...props()} /></StrictMode>);
    await waitFor(() => expect(accountSessions.connectRedirect).toHaveBeenCalledOnce());
    expect(accountSessions.connectRedirect).toHaveBeenCalledWith('google', expect.objectContaining({ loginHint: '123456789',
      returnTo: expect.stringContaining('https://colmapview.opsiclear.com/?drive=open&state=') }), expect.any(AbortSignal));
    expect(runStartupLoadPlan).not.toHaveBeenCalled();
  });
  it('does not restart authorization after a cancelled Google return', async () => {
    vi.stubEnv('VITE_ACCOUNT_SESSIONS_ENABLED', 'true');
    savedSessions.capabilities.google = true;
    vi.mocked(accountSessions.token).mockRejectedValue(new Error('No session'));
    window.history.replaceState(null, '', `${launch}&account_provider=google&account_result=cancelled`);
    render(<GoogleDriveOpenWith {...props()} />);
    await screen.findByRole('button', { name: 'Sign in with Google' });
    expect(accountSessions.connectRedirect).not.toHaveBeenCalled();
    expect(runStartupLoadPlan).not.toHaveBeenCalled();
  });
  it('discards another account token, removes raw state and loads exactly the selected archive after explicit sign-in', async () => {
    googleDriveAuth.connect('123-client.apps.googleusercontent.com', sdk);
    authorize();
    vi.clearAllMocks();
    const loaders = props();
    render(<StrictMode><GoogleDriveOpenWith {...loaders} /></StrictMode>);
    expect(googleDriveAuth.getAccessToken()).toBeNull();
    expect(window.location.search).not.toContain('state=');
    expect(window.location.href).not.toContain('123456789');
    expect(runStartupLoadPlan).not.toHaveBeenCalled();
    expect(requestAccessToken).not.toHaveBeenCalled();
    const signIn = await screen.findByRole('button', { name: 'Sign in with Google' });
    await waitFor(() => expect(signIn).toBeEnabled());
    fireEvent.click(signIn);
    expect(sdk.initTokenClient).toHaveBeenCalledWith(expect.objectContaining({ login_hint: '123456789' }));
    authorize();
    expect(runStartupLoadPlan).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      manifestUrl: 'https://drive.google.com/file/d/selected-file/view?resourcekey=resource-key',
    }), { loadFromUrl: loaders.loadFromUrl, loadFromManifest: loaders.loadFromManifest });
    expect(chooseGoogleDriveArchive).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('abandons a canceled sign-in without accepting a late token or loading', async () => {
    render(<GoogleDriveOpenWith {...props()} />);
    const signIn = await screen.findByRole('button', { name: 'Sign in with Google' });
    await waitFor(() => expect(signIn).toBeEnabled());
    fireEvent.click(signIn);
    fireEvent.click(screen.getByRole('button', { name: 'Close account dialog' }));
    authorize();
    expect(googleDriveAuth.getAccessToken()).toBeNull();
    expect(runStartupLoadPlan).not.toHaveBeenCalled();
  });
  it('hands off disabled hosts without loading a Google SDK or authorizing', () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'false');
    render(<GoogleDriveOpenWith {...props()} />);
    expect(screen.getByRole('link', { name: 'Open ColmapView' })).toHaveAttribute('href', expect.stringContaining('https://colmapview.opsiclear.com/?drive=open'));
    expect(loadGoogleOAuthSdk).not.toHaveBeenCalled();
    expect(requestAccessToken).not.toHaveBeenCalled();
    expect(runStartupLoadPlan).not.toHaveBeenCalled();
  });
  it('rejects malformed state without falling back to a conflicting dataset URL', () => {
    window.history.replaceState(null, '', '?drive=open&state=bad&url=https://other.invalid');
    render(<GoogleDriveOpenWith {...props()} />);
    expect(screen.getByText(/This Google Drive launch link is invalid/)).toBeVisible();
    expect(window.location.search).toBe('');
    expect(loadGoogleOAuthSdk).not.toHaveBeenCalled();
    expect(runStartupLoadPlan).not.toHaveBeenCalled();
  });
});
