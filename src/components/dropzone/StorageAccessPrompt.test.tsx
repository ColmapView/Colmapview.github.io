import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageAccessPrompt } from './StorageAccessPrompt';
import { useReconstructionStore } from '../../store';
import { offerUrlLoadRetry } from '../../appStartupRetry';
import { bucketConnection } from '../../features/bucketStorage/connection';
import { hfAuth } from '../../features/huggingface/auth';
import * as googleOAuth from '../../features/googleDrive/auth';
import * as googlePicker from '../../features/googleDrive/picker';
import type { UrlLoadError } from '../../types/manifest';

const root = 'https://account.r2.cloudflarestorage.com/bucket/';
const accessFailure: UrlLoadError = { type: 'auth', message: 'Connect to this bucket to continue.', access: { provider: 'bucket', bucketUrl: root } };
const props = () => ({ onOpenUrlModal: vi.fn(), onLoadRemoteDataset: vi.fn() });
function fail(error: UrlLoadError, retry = vi.fn().mockResolvedValue(undefined)) {
  act(() => { useReconstructionStore.getState().setUrlError(error); offerUrlLoadRetry(retry); });
  return retry;
}
function configureDrive() {
  vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true'); vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', '');
  vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '12345-fixture.apps.googleusercontent.com');
  vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'fixture-api-key'); vi.stubEnv('VITE_GOOGLE_DRIVE_APP_ID', '12345');
  let authorize: ((response: googleOAuth.GoogleTokenResponse) => void) | undefined;
  const requestAccessToken = vi.fn();
  const sdk: googleOAuth.GoogleOAuthSdk = { initTokenClient: vi.fn(config => {
    authorize = config.callback;
    return { requestAccessToken };
  }) };
  vi.spyOn(googleOAuth, 'loadGoogleOAuthSdk').mockResolvedValue(sdk);
  const choose = vi.spyOn(googlePicker, 'chooseGoogleDriveArchive').mockResolvedValue(null);
  return { sdk, choose, requestAccessToken, authorize: () => act(() => authorize?.({
    access_token: 'test-token', expires_in: 3600, token_type: 'Bearer', scope: googleOAuth.GOOGLE_DRIVE_SCOPE,
  })) };
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'false'); vi.stubEnv('VITE_HF_AUTH_ENABLED', 'false');
  useReconstructionStore.getState().setUrlError(null); bucketConnection.disconnect();
});
afterEach(() => {
  cleanup(); useReconstructionStore.getState().setUrlError(null); bucketConnection.disconnect();
  googleOAuth.googleDriveAuth.disconnect();
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
});
describe('storage access recovery', () => {
  it('prefills the actual bucket, connects in this tab and retries the retained load', async () => {
    const retry = fail(accessFailure); render(<StorageAccessPrompt {...props()} />);
    const dialog = await screen.findByRole('dialog', { name: 'Bucket storage' });
    expect(screen.getByLabelText('Bucket URL')).toHaveValue(root);
    expect(screen.queryByRole('button', { name: 'Public URL' })).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent(accessFailure.message);
    fireEvent.click(screen.getByText('CORS setup', { selector: 'summary' }));
    expect(dialog).toHaveTextContent('https://colmapview.opsiclear.com');
    expect(dialog).toHaveTextContent('https://colmapview.github.io');
    fireEvent.change(screen.getByLabelText('Access key ID'), { target: { value: 'fixture-access' } });
    fireEvent.change(screen.getByLabelText('Secret key'), { target: { value: 'fixture-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect and retry' }));
    await waitFor(() => expect(retry).toHaveBeenCalledOnce());
    expect(bucketConnection.getSnapshot().canWrite).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('fixture-secret');
  });
  it('lets the user replace stale or unrelated bucket credentials without discarding them on dismiss', async () => {
    const previous = bucketConnection.connect({ baseUrl: 'https://other.example/bucket/', region: 'us-east-1' },
      { accessKeyId: 'old-key', secretAccessKey: 'old-secret' });
    fail(accessFailure); const rendered = render(<StorageAccessPrompt {...props()} />);
    await screen.findByRole('dialog');
    expect(screen.getByLabelText('Bucket URL')).toHaveValue(root);
    expect(screen.getByLabelText('Access key ID')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Close bucket storage' }));
    rendered.rerender(<StorageAccessPrompt {...props()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bucketConnection.getSession()).toBe(previous);
    fail({ ...accessFailure });
    await screen.findByRole('dialog');
  });
  it('withdraws the prompt when a different load clears the failed operation', async () => {
    fail(accessFailure); render(<StorageAccessPrompt {...props()} />);
    await screen.findByRole('dialog');
    act(() => useReconstructionStore.getState().setUrlError(null));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('does not offer sign-in for a genuine CORS failure or an unavailable OAuth provider', () => {
    fail({ type: 'cors', message: 'Whitelist this viewer.' }); render(<StorageAccessPrompt {...props()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fail({ type: 'auth', message: 'Sign in.', access: { provider: 'hf' } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('opens the existing HF account dialog but starts OAuth only on an explicit sign-in click', async () => {
    vi.stubEnv('VITE_HF_AUTH_ENABLED', 'true'); vi.stubEnv('VITE_HF_OAUTH_CLIENT_ID', 'fixture-client');
    vi.stubEnv('VITE_HF_OAUTH_REDIRECT_URI', `${window.location.origin}/hf-callback.html`);
    const connect = vi.spyOn(hfAuth, 'connect').mockResolvedValue(undefined);
    fail({ type: 'auth', message: 'Sign in to read this dataset.', access: { provider: 'hf' } });
    render(<StorageAccessPrompt {...props()} />);
    expect(screen.getByRole('dialog', { name: 'Hugging Face' })).toHaveTextContent('Sign in to read this dataset.');
    expect(connect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Hugging Face' }));
    expect(connect).toHaveBeenCalledOnce();
  });
  it('offers the configured Google Drive sign-in and Picker without starting OAuth automatically', async () => {
    const { sdk, requestAccessToken } = configureDrive();
    fail({ type: 'auth', message: 'This Drive link could not be opened. It may be private or no longer available.', access: { provider: 'google' } });
    render(<StorageAccessPrompt {...props()} />);
    const dialog = screen.getByRole('dialog', { name: 'Google Drive' });
    expect(dialog).toHaveTextContent('Sign in with an account that has access to this file.');
    expect(dialog).not.toHaveTextContent('Anyone with the link');
    expect(screen.getByRole('button', { name: 'Use another link' })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled());
    expect(sdk.initTokenClient).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(requestAccessToken).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close account dialog' }));
    expect(googleOAuth.googleDriveAuth.getSnapshot().status).toBe('disconnected');
  });
  it('retries the retained Drive link after sign-in without requiring the picker for an accessible file', async () => {
    const oauth = configureDrive();
    const retry = fail({ type: 'auth', message: 'This Drive link could not be opened.', access: { provider: 'google' } });
    render(<StorageAccessPrompt {...props()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    oauth.authorize();
    await waitFor(() => expect(retry).toHaveBeenCalledOnce());
    expect(oauth.choose).not.toHaveBeenCalled();
    expect(googleOAuth.googleDriveAuth.getSnapshot().status).toBe('connected');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('offers explicit file selection if the authenticated retry still needs per-file access', async () => {
    const oauth = configureDrive();
    const failure: UrlLoadError = { type: 'auth', message: 'Choose this file from Drive.', access: { provider: 'google' } };
    const retry = fail(failure, vi.fn(async () => { fail({ ...failure }); }));
    render(<StorageAccessPrompt {...props()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    oauth.authorize();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose file from Drive' })).toBeEnabled());
    expect(retry).toHaveBeenCalledOnce();
    expect(oauth.choose).not.toHaveBeenCalled();
    expect(oauth.requestAccessToken).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Choose file from Drive' }));
    await waitFor(() => expect(oauth.choose).toHaveBeenCalledOnce());
  });
});
