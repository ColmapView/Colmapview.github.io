import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetAccountButtons } from './DatasetAccountButtons';
import { googleDriveAuth, loadGoogleOAuthSdk, type GoogleOAuthSdk, type GoogleTokenResponse } from '../../features/googleDrive/auth';
import { chooseGoogleDriveArchive, getGoogleDrivePickerConfig } from '../../features/googleDrive/picker';
import { hfAuth } from '../../features/huggingface/auth';
import { isGoogleDriveEnabled, resolveGoogleDriveHostingConfig } from '../../features/googleDrive/config';

vi.mock('../../features/googleDrive/config', async importOriginal => ({
  ...await importOriginal<typeof import('../../features/googleDrive/config')>(),
  isGoogleDriveEnabled: vi.fn(() => false),
}));

vi.mock('../../features/googleDrive/auth', async importOriginal => ({
  ...await importOriginal<typeof import('../../features/googleDrive/auth')>(),
  loadGoogleOAuthSdk: vi.fn(),
}));
vi.mock('../../features/googleDrive/picker', () => ({
  getGoogleDrivePickerConfig: vi.fn(),
  chooseGoogleDriveArchive: vi.fn(),
}));

const pickerConfig = {
  clientId: '123-test.apps.googleusercontent.com',
  apiKey: 'test-key',
  appId: '123',
};
const selectedArchive = {
  fileId: 'chosen-zip',
  name: 'dataset.zip',
  resourceKey: 'shared-key',
  url: 'https://drive.google.com/file/d/chosen-zip/view?resourcekey=shared-key',
};

function createGoogleSdk() {
  let callback: ((response: GoogleTokenResponse) => void) | undefined;
  const requestAccessToken = vi.fn();
  const sdk: GoogleOAuthSdk = {
    initTokenClient: vi.fn(config => {
      callback = config.callback;
      return { requestAccessToken };
    }),
  };
  return {
    sdk,
    requestAccessToken,
    authorize: () => act(() => callback?.({
      access_token: 'test-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'https://www.googleapis.com/auth/drive.file',
    })),
  };
}

function configureDrive(connected = false) {
  vi.mocked(isGoogleDriveEnabled).mockReturnValue(true);
  vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', pickerConfig.clientId);
  vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', pickerConfig.apiKey);
  vi.stubEnv('VITE_GOOGLE_DRIVE_APP_ID', pickerConfig.appId);
  vi.mocked(getGoogleDrivePickerConfig).mockReturnValue(pickerConfig);
  const oauth = createGoogleSdk();
  vi.mocked(loadGoogleOAuthSdk).mockResolvedValue(oauth.sdk);
  if (connected) {
    googleDriveAuth.connect(pickerConfig.clientId, oauth.sdk);
    oauth.authorize();
  }
  return oauth;
}

function createProps() {
  return { onOpenUrlModal: vi.fn(), onLoadGoogleDriveArchive: vi.fn() };
}

beforeEach(() => {
  vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'false');
  vi.stubEnv('VITE_HF_AUTH_ENABLED', 'false');
  vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
  vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', '');
  vi.mocked(loadGoogleOAuthSdk).mockReset();
  vi.mocked(chooseGoogleDriveArchive).mockReset();
  vi.mocked(getGoogleDrivePickerConfig).mockReturnValue(null);
  vi.mocked(isGoogleDriveEnabled).mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  document.querySelector('[data-testid="mock-google-picker"]')?.remove();
  googleDriveAuth.disconnect(); hfAuth.disconnect();
  vi.unstubAllEnvs(); vi.restoreAllMocks();
});

describe('Dataset provider account icons', () => {
  it('keeps public URL loading available when private file selection is unavailable', () => {
    vi.mocked(isGoogleDriveEnabled).mockReturnValue(true);
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', pickerConfig.apiKey);
    const props = createProps();
    render(<DatasetAccountButtons {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive account' }));
    expect(screen.getByText('Load a public dataset by URL.')).toBeVisible();
    expect(screen.getByText(/Private file selection is unavailable/)).toBeVisible();
    expect(screen.queryByText(/setup is incomplete/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose archive from Drive' })).not.toBeInTheDocument();
    expect(loadGoogleOAuthSdk).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Load URL' }));
    expect(props.onOpenUrlModal).toHaveBeenCalledOnce();
    expect(props.onLoadGoogleDriveArchive).not.toHaveBeenCalled();
    expect(chooseGoogleDriveArchive).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([false, true])('offers URL loading in an OAuth-only setup only with an existing reader session (connected=%s)', connected => {
    configureDrive(connected);
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', '');
    vi.stubEnv('VITE_GOOGLE_DRIVE_APP_ID', '');
    vi.mocked(getGoogleDrivePickerConfig).mockReturnValue(null);
    const props = createProps();
    render(<DatasetAccountButtons {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive account' }));
    expect(screen.getByText('Private file selection is unavailable.')).toBeVisible();
    expect(screen.queryByText(/public dataset/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose archive from Drive' })).not.toBeInTheDocument();
    expect(loadGoogleOAuthSdk).not.toHaveBeenCalled();
    expect(chooseGoogleDriveArchive).not.toHaveBeenCalled();
    if (connected) {
      expect(screen.getByText('Load a previously authorized dataset by URL.')).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Load URL' }));
      expect(props.onOpenUrlModal).toHaveBeenCalledOnce();
    } else {
      expect(screen.getByText('Google Drive loading is unavailable in this viewer.')).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Load URL' })).not.toBeInTheDocument();
      expect(props.onOpenUrlModal).not.toHaveBeenCalled();
    }
  });

  it('removes OAuth-only URL loading when the existing reader disconnects', () => {
    configureDrive(true);
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', '');
    vi.mocked(getGoogleDrivePickerConfig).mockReturnValue(null);
    render(<DatasetAccountButtons {...createProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive account' }));
    expect(screen.getByRole('button', { name: 'Load URL' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(screen.queryByRole('button', { name: 'Load URL' })).not.toBeInTheDocument();
    expect(screen.getByText('Google Drive loading is unavailable in this viewer.')).toBeVisible();
  });

  it.each([
    { host: 'GitHub Pages', origin: 'https://colmapview.github.io', flag: 'true' },
    { host: 'Cloudflare preview', origin: 'https://preview.colmapview.pages.dev', flag: 'true' },
    { host: 'disabled custom host', origin: 'https://colmapview.opsiclear.com', flag: 'false' },
  ])('offers a Drive link on $host and leaves Hugging Face available', ({ origin, flag }) => {
    vi.mocked(isGoogleDriveEnabled).mockReturnValue(resolveGoogleDriveHostingConfig({ origin, development: false,
      env: { VITE_GOOGLE_DRIVE_ENABLED: flag, VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN: 'https://colmapview.opsiclear.com',
        VITE_GOOGLE_DRIVE_CLIENT_ID: pickerConfig.clientId, VITE_GOOGLE_DRIVE_API_KEY: pickerConfig.apiKey },
    }).enabled);
    vi.mocked(getGoogleDrivePickerConfig).mockReturnValue(pickerConfig);
    const props = createProps();
    render(<DatasetAccountButtons {...props} />);
    expect(screen.getByRole('link', { name: 'Use Google Drive' })).toHaveAttribute('href', 'https://colmapview.opsiclear.com');
    expect(screen.getByText('Use Google Drive')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Google Drive account' })).not.toBeInTheDocument();
    expect(screen.queryByText(/setup|configuration/i)).not.toBeInTheDocument();
    expect(loadGoogleOAuthSdk).not.toHaveBeenCalled();
    expect(chooseGoogleDriveArchive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face account' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Hugging Face');
    fireEvent.click(screen.getByRole('button', { name: 'Load URL' }));
    expect(props.onOpenUrlModal).toHaveBeenCalledOnce();
  });

  it('does not authorize or open the picker merely by opening the account dialog', async () => {
    const oauth = configureDrive();
    const connect = vi.spyOn(googleDriveAuth, 'connect');
    render(<DatasetAccountButtons {...createProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive account' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose archive from Drive' })).toBeEnabled());
    expect(connect).not.toHaveBeenCalled();
    expect(oauth.requestAccessToken).not.toHaveBeenCalled();
    expect(chooseGoogleDriveArchive).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a ZIP or TAR from Drive. Sign in to open private files.')).toBeVisible();
    expect(screen.getByText(/Access is limited to files you choose/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Privacy' })).toBeVisible();
  });

  it.each([
    selectedArchive,
    {
      fileId: '1DpE-bfPPIVp7TwZeMyhmisfEwCrJ0QDd',
      name: 'dataset.tar',
      url: 'https://drive.google.com/file/d/1DpE-bfPPIVp7TwZeMyhmisfEwCrJ0QDd/view',
    },
  ])('signs in on Choose archive and automatically loads the selected $name URL', async selection => {
    const oauth = configureDrive();
    vi.mocked(chooseGoogleDriveArchive).mockResolvedValue(selection);
    const props = createProps();
    render(<DatasetAccountButtons {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive account' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose archive from Drive' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Choose archive from Drive' }));
    expect(oauth.requestAccessToken).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for sign-in');
    expect(chooseGoogleDriveArchive).not.toHaveBeenCalled();
    oauth.authorize();
    await waitFor(() => expect(props.onLoadGoogleDriveArchive).toHaveBeenCalledExactlyOnceWith(selection.url));
    expect(chooseGoogleDriveArchive).toHaveBeenCalledOnce();
    expect(props.onOpenUrlModal).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uses the existing connection to choose another archive without signing in again', async () => {
    const oauth = configureDrive(true);
    vi.mocked(chooseGoogleDriveArchive).mockResolvedValue(selectedArchive);
    const props = createProps();
    render(<DatasetAccountButtons {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose archive from Drive' }));
    await waitFor(() => expect(props.onLoadGoogleDriveArchive).toHaveBeenCalledExactlyOnceWith(selectedArchive.url));
    expect(oauth.requestAccessToken).toHaveBeenCalledOnce();
  });

  it('keeps public URL loading independent of Google authorization when configured', async () => {
    const oauth = configureDrive();
    const props = createProps();
    render(<DatasetAccountButtons {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive account' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose archive from Drive' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Load URL' }));
    expect(props.onOpenUrlModal).toHaveBeenCalledOnce();
    expect(oauth.requestAccessToken).not.toHaveBeenCalled();
    expect(chooseGoogleDriveArchive).not.toHaveBeenCalled();
  });

  it('cancels a pending sign-in without opening the picker on a late authorization callback', async () => {
    const oauth = configureDrive();
    const props = createProps();
    render(<DatasetAccountButtons {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive account' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose archive from Drive' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Choose archive from Drive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
    oauth.authorize();
    expect(googleDriveAuth.getSnapshot().status).toBe('disconnected');
    expect(screen.getByRole('button', { name: 'Choose archive from Drive' })).toBeEnabled();
    expect(chooseGoogleDriveArchive).not.toHaveBeenCalled();
    expect(props.onLoadGoogleDriveArchive).not.toHaveBeenCalled();
  });

  it('returns to the account dialog after picker cancellation without loading anything', async () => {
    configureDrive(true);
    let finish: ((value: null) => void) | undefined;
    let pickerButton: HTMLButtonElement | undefined;
    vi.mocked(chooseGoogleDriveArchive).mockImplementation(options => {
      options?.onOpen?.();
      pickerButton = document.createElement('button');
      pickerButton.dataset.testid = 'mock-google-picker';
      document.body.append(pickerButton);
      pickerButton.focus();
      return new Promise(resolve => { finish = resolve; });
    });
    const props = createProps();
    render(<DatasetAccountButtons {...props} />);
    const driveAccount = screen.getByRole('button', { name: 'Google Drive account' });
    driveAccount.focus();
    fireEvent.click(driveAccount);
    fireEvent.click(screen.getByRole('button', { name: 'Choose archive from Drive' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => Promise.resolve());
    expect(pickerButton).toHaveFocus();
    pickerButton?.remove();
    await act(async () => finish?.(null));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Choose archive from Drive' })).toBeEnabled();
    expect(props.onLoadGoogleDriveArchive).not.toHaveBeenCalled();
    expect(props.onOpenUrlModal).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows picker loading and aborts selection without accepting a late result', async () => {
    configureDrive(true);
    let signal: AbortSignal | undefined;
    let finish: ((value: typeof selectedArchive) => void) | undefined;
    vi.mocked(chooseGoogleDriveArchive).mockImplementation(options => {
      signal = options?.signal;
      return new Promise(resolve => { finish = resolve; });
    });
    const props = createProps();
    render(<DatasetAccountButtons {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose archive from Drive' }));
    expect(screen.getByRole('status')).toHaveTextContent('Opening Drive picker');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel selection' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => finish?.(selectedArchive));
    expect(screen.getByRole('button', { name: 'Choose archive from Drive' })).toBeEnabled();
    expect(props.onLoadGoogleDriveArchive).not.toHaveBeenCalled();
  });

  it('shows picker errors and allows retrying the selection', async () => {
    configureDrive(true);
    vi.mocked(chooseGoogleDriveArchive).mockRejectedValueOnce(new Error('Choose a ZIP or TAR archive from Google Drive.'))
      .mockResolvedValueOnce(selectedArchive);
    const props = createProps();
    render(<DatasetAccountButtons {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose archive from Drive' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a ZIP or TAR archive from Google Drive.');
    expect(props.onLoadGoogleDriveArchive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Choose archive from Drive' }));
    await waitFor(() => expect(props.onLoadGoogleDriveArchive).toHaveBeenCalledExactlyOnceWith(selectedArchive.url));
  });

  it('opens the existing Hugging Face account controls and URL action', () => {
    const props = createProps();
    render(<DatasetAccountButtons {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face account' }));
    expect(screen.getByText(/Hugging Face sign-in is unavailable/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Choose archive from Drive' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load URL' }));
    expect(props.onOpenUrlModal).toHaveBeenCalledOnce();
    expect(props.onLoadGoogleDriveArchive).not.toHaveBeenCalled();
    expect(loadGoogleOAuthSdk).not.toHaveBeenCalled();
  });

  it('keeps configured Hugging Face sign-in separate from the Drive picker', () => {
    vi.stubEnv('VITE_HF_AUTH_ENABLED', 'true');
    vi.stubEnv('VITE_HF_OAUTH_CLIENT_ID', 'hf-test-client');
    vi.stubEnv('VITE_HF_OAUTH_REDIRECT_URI', `${window.location.origin}/hf-callback.html`);
    const connect = vi.spyOn(hfAuth, 'connect').mockResolvedValue(undefined);
    render(<DatasetAccountButtons {...createProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face account' }));
    expect(screen.getByText('Allows reading your repositories, including private datasets.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Hugging Face' }));
    expect(connect).toHaveBeenCalledExactlyOnceWith({
      clientId: 'hf-test-client', redirectUri: `${window.location.origin}/hf-callback.html`, readOnly: true,
    });
    expect(loadGoogleOAuthSdk).not.toHaveBeenCalled();
    expect(chooseGoogleDriveArchive).not.toHaveBeenCalled();
  });

  it('keeps connected Hugging Face identity, disconnect, and URL controls', () => {
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({
      status: 'connected', identity: { username: 'test-user' }, error: null,
    });
    const disconnect = vi.spyOn(hfAuth, 'disconnect');
    const props = createProps();
    render(<DatasetAccountButtons {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face account' }));
    expect(screen.getByRole('status')).toHaveTextContent('Connected as test-user');
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(disconnect).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Load URL' }));
    expect(props.onOpenUrlModal).toHaveBeenCalledOnce();
    expect(chooseGoogleDriveArchive).not.toHaveBeenCalled();
  });

  it('clears a stale script error when reopening the account dialog succeeds', async () => {
    const oauth = configureDrive();
    vi.mocked(loadGoogleOAuthSdk).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(oauth.sdk);
    render(<DatasetAccountButtons {...createProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive account' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Close account dialog' }));
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive account' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose archive from Drive' })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
