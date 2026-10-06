import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOOGLE_DRIVE_READ_SCOPE, googleDriveAuth, type GoogleOAuthSdk } from './auth';
import { chooseGoogleDriveArchive, getGoogleDrivePickerConfig, parseGoogleDriveArchiveSelection, type GooglePickerSdk } from './picker';

function pickerSdk() {
  let callback: (response: unknown) => void = () => {};
  const dialog = { setVisible: vi.fn(), dispose: vi.fn() };
  const view = { setMimeTypes: vi.fn().mockReturnThis(), setIncludeFolders: vi.fn().mockReturnThis(), setSelectFolderEnabled: vi.fn().mockReturnThis() };
  const builder = {
    addView: vi.fn().mockReturnThis(), setDeveloperKey: vi.fn().mockReturnThis(), setAppId: vi.fn().mockReturnThis(),
    setOAuthToken: vi.fn().mockReturnThis(), setOrigin: vi.fn().mockReturnThis(), setMaxItems: vi.fn().mockReturnThis(),
    setSelectableMimeTypes: vi.fn().mockReturnThis(), setTitle: vi.fn().mockReturnThis(),
    setCallback: vi.fn((handler: (response: unknown) => void) => { callback = handler; return builder; }), build: vi.fn(() => dialog),
  };
  const sdk: GooglePickerSdk = {
    DocsView: class { constructor() { return view; } } as GooglePickerSdk['DocsView'],
    PickerBuilder: class { constructor() { return builder; } } as GooglePickerSdk['PickerBuilder'],
    ViewId: { DOCS: 'docs' }, Action: { PICKED: 'picked', CANCEL: 'cancel', ERROR: 'error' },
  };
  return { sdk, view, builder, dialog, callback: (value: unknown) => callback(value) };
}

function signIn(expires = 3600) {
  const sdk: GoogleOAuthSdk = { initTokenClient: config => ({ requestAccessToken: () => config.callback({
    access_token: 'memory-only-test-token', scope: GOOGLE_DRIVE_READ_SCOPE, token_type: 'Bearer', expires_in: expires,
  }) }) };
  googleDriveAuth.connect('123456-client.apps.googleusercontent.com', sdk);
}

beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'browser-key');
  vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '123456-client.apps.googleusercontent.com');
  vi.stubEnv('VITE_GOOGLE_DRIVE_APP_ID', '123456');
  signIn();
});
afterEach(() => { googleDriveAuth.disconnect(); vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Google Drive archive picker configuration', () => {
  it('requires the explicit numeric Cloud project number without deriving it from the OAuth client', () => {
    expect(getGoogleDrivePickerConfig()).toEqual({ apiKey: 'browser-key', clientId: '123456-client.apps.googleusercontent.com', appId: '123456' });
    vi.stubEnv('VITE_GOOGLE_DRIVE_APP_ID', '');
    expect(getGoogleDrivePickerConfig()).toBeNull();
    vi.stubEnv('VITE_GOOGLE_DRIVE_APP_ID', 'my-project-id');
    expect(getGoogleDrivePickerConfig()).toBeNull();
  });
  it.each(['VITE_GOOGLE_DRIVE_API_KEY', 'VITE_GOOGLE_DRIVE_CLIENT_ID'])('requires %s', key => {
    vi.stubEnv(key, '');
    expect(getGoogleDrivePickerConfig()).toBeNull();
  });
});

describe('Google Drive archive selection validation', () => {
  it('constructs a canonical file URL with a resource key and drops raw provider URLs', () => {
    const selected = parseGoogleDriveArchiveSelection({ id: 'file_123', name: 'dataset.ZIP', resourceKey: '0-key', downloadUrl: 'https://provider.example/?access_token=secret' });
    expect(selected).toEqual({ fileId: 'file_123', name: 'dataset.ZIP', resourceKey: '0-key', url: 'https://drive.google.com/file/d/file_123/view?resourcekey=0-key' });
    expect(JSON.stringify(selected)).not.toContain('secret');
    expect(parseGoogleDriveArchiveSelection({ id: 'file', name: 'dataset.zip', resourceKey: '' })).not.toHaveProperty('resourceKey');
  });
  it.each(['.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tbz', '.tar.xz', '.txz'])('accepts supported TAR format %s regardless of Drive MIME labels', extension => {
    expect(parseGoogleDriveArchiveSelection({ id: 'tar-file', name: `dataset${extension}`, mimeType: 'application/octet-stream' }))
      .toMatchObject({ fileId: 'tar-file', name: `dataset${extension}`, url: 'https://drive.google.com/file/d/tar-file/view' });
  });
  it.each([
    { id: 'file', name: 'dataset.gz' }, { id: 'file', name: 'dataset.7z' }, { id: '../file', name: 'dataset.zip' },
    { id: 'file', name: 'dataset.zip', resourceKey: 'key/header,injection' }, { id: 'file', name: 'dataset.zip', resourceKey: null },
    { id: 'file', name: 'name\n.zip' }, { id: 'file', name: 'dataset.zip', driveSuccess: false },
  ])('rejects unsupported formats or unsafe selections', selection => { expect(() => parseGoogleDriveArchiveSelection(selection)).toThrow(); });
});

describe('Google Drive archive picker lifecycle', () => {
  it('does not invoke an injected Picker SDK on a disabled host, even with complete configuration', async () => {
    const { sdk, builder, dialog } = pickerSdk();
    vi.stubGlobal('location', { origin: 'https://preview.colmap-webview.pages.dev' });
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
    vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', 'https://colmapview.opsiclear.com');
    await expect(chooseGoogleDriveArchive({ sdk })).rejects.toThrow('available at');
    expect(getGoogleDrivePickerConfig()).toBeNull();
    expect(builder.build).not.toHaveBeenCalled();
    expect(dialog.setVisible).not.toHaveBeenCalled();
  });

  it('opens a ZIP/TAR single-file view with drive.file app identity and permits binary-labelled TARs', async () => {
    const { sdk, builder, view, dialog, callback } = pickerSdk();
    const onOpen = vi.fn();
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const pending = chooseGoogleDriveArchive({ sdk, onOpen });
    await Promise.resolve();
    expect(builder.setAppId).toHaveBeenCalledWith('123456');
    expect(builder.setOAuthToken).toHaveBeenCalledWith('memory-only-test-token');
    expect(builder.setMaxItems).toHaveBeenCalledWith(1);
    const mimeTypes = builder.setSelectableMimeTypes.mock.calls[0][0];
    expect(mimeTypes.split(',')).toEqual(expect.arrayContaining([
      'application/zip', 'application/x-zip-compressed', 'application/x-tar', 'application/gzip',
      'application/x-gzip', 'application/x-bzip2', 'application/x-xz', 'application/x-compressed-tar', 'application/octet-stream',
    ]));
    expect(mimeTypes.split(',')).not.toContain('application/x-7z-compressed');
    expect(view.setMimeTypes).toHaveBeenCalledWith(mimeTypes);
    expect(view.setSelectFolderEnabled).toHaveBeenCalledWith(false);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(dialog.setVisible).toHaveBeenCalledWith(true);
    callback({ action: 'picked', docs: [{ id: 'selected-file', name: 'dataset.zip', resourceKey: '0-key' }] });
    await expect(pending).resolves.toMatchObject({ fileId: 'selected-file', url: 'https://drive.google.com/file/d/selected-file/view?resourcekey=0-key' });
    expect(dialog.setVisible).toHaveBeenLastCalledWith(false);
    expect(dialog.dispose).toHaveBeenCalledOnce();
    expect(storage).not.toHaveBeenCalled();
  });
  it.each([
    ['scan_20250416_093245.tar', 'application/x-tar'],
    ['scan_20250416_093245.tar', 'application/octet-stream'],
    ['scan.tar.gz', 'application/gzip'],
    ['scan.tgz', 'application/octet-stream'],
  ])('selects one TAR archive %s (%s) and retains its resource key', async (name, mimeType) => {
    const { sdk, callback } = pickerSdk();
    const pending = chooseGoogleDriveArchive({ sdk });
    await Promise.resolve();
    callback({ action: 'picked', docs: [{ id: '1DpE-bfPPIVp7TwZeMyhmisfEwCrJ0QDd', name, mimeType, resourceKey: '0-key' }] });
    await expect(pending).resolves.toEqual({
      fileId: '1DpE-bfPPIVp7TwZeMyhmisfEwCrJ0QDd', name, resourceKey: '0-key',
      url: 'https://drive.google.com/file/d/1DpE-bfPPIVp7TwZeMyhmisfEwCrJ0QDd/view?resourcekey=0-key',
    });
  });
  it('returns null on cancel and ignores subsequent provider callbacks', async () => {
    const { sdk, dialog, callback } = pickerSdk();
    const pending = chooseGoogleDriveArchive({ sdk });
    await Promise.resolve();
    callback({ action: 'cancel' });
    callback({ action: 'picked', docs: [{ id: 'later', name: 'dataset.zip' }] });
    await expect(pending).resolves.toBeNull();
    expect(dialog.dispose).toHaveBeenCalledOnce();
  });
  it('closes and disposes when caller aborts the open picker', async () => {
    const { sdk, dialog } = pickerSdk();
    const controller = new AbortController();
    const pending = chooseGoogleDriveArchive({ sdk, signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    await expect(pending).resolves.toBeNull();
    expect(dialog.setVisible).toHaveBeenLastCalledWith(false);
    expect(dialog.dispose).toHaveBeenCalledOnce();
  });
  it('does not open a picker when caller cancels before SDK readiness', async () => {
    const { sdk, dialog } = pickerSdk();
    const controller = new AbortController();
    const pending = chooseGoogleDriveArchive({ sdk, signal: controller.signal });
    controller.abort();
    await expect(pending).resolves.toBeNull();
    expect(dialog.setVisible).not.toHaveBeenCalled();
  });
  it('closes an expired reader session without changing the publisher or reauthorizing automatically', async () => {
    vi.useFakeTimers();
    googleDriveAuth.disconnect();
    signIn(60);
    const { sdk, dialog } = pickerSdk();
    const pending = chooseGoogleDriveArchive({ sdk });
    const rejection = expect(pending).rejects.toThrow('expired or disconnected');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(55_000);
    await rejection;
    expect(dialog.dispose).toHaveBeenCalledOnce();
    expect(googleDriveAuth.getAccessToken()).toBeNull();
  });
  it.each([
    { action: 'picked', docs: [{ id: 'file', name: 'dataset.7z' }] },
    { action: 'picked', docs: [] },
    { action: 'picked', docs: [{ id: 'first', name: 'first.zip' }, { id: 'second', name: 'second.zip' }] },
    { action: 'error', error: 'private provider details and token' },
  ])('handles invalid results and SDK errors without exposing provider details', async response => {
    const { sdk, dialog, callback } = pickerSdk();
    const pending = chooseGoogleDriveArchive({ sdk });
    const rejection = expect(pending).rejects.toThrow(/ZIP|picker/);
    await Promise.resolve();
    callback(response);
    await rejection;
    expect(dialog.dispose).toHaveBeenCalledOnce();
  });
  it('rejects concurrent dialogs, then allows a new attempt after cancellation', async () => {
    const { sdk, callback } = pickerSdk();
    const first = chooseGoogleDriveArchive({ sdk });
    await expect(chooseGoogleDriveArchive({ sdk })).rejects.toThrow('already open');
    callback({ action: 'cancel' });
    await first;
    const next = chooseGoogleDriveArchive({ sdk });
    await Promise.resolve();
    callback({ action: 'cancel' });
    await expect(next).resolves.toBeNull();
  });
});
