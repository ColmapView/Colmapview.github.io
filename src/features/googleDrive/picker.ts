import { googleDriveAuth } from './auth';
import { assertGoogleDriveHostAllowed, getGoogleDriveConfiguration } from './config';
import { GOOGLE_DRIVE_ARCHIVE_MIME_TYPES, isGoogleDriveArchiveFilename } from './archivePolicy';

const PICKER_SCRIPT_URL = 'https://apis.google.com/js/api.js';
const SAFE_DRIVE_ID = /^[A-Za-z0-9_-]{1,200}$/;
const PICKER_LOAD_ERROR = 'Could not load the Google Drive picker. Check your connection and try again.';

export interface GoogleDrivePickerConfig {
  apiKey: string;
  clientId: string;
  /** The numeric Cloud project number, not its project ID or OAuth client ID. */
  appId: string;
}

export interface GoogleDriveArchiveSelection {
  fileId: string;
  name: string;
  resourceKey?: string;
  /** A canonical file link; never the Picker's download URL or token. */
  url: string;
}

interface PickerView {
  setMimeTypes(types: string): PickerView;
  setIncludeFolders(include: boolean): PickerView;
  setSelectFolderEnabled(enabled: boolean): PickerView;
}

interface PickerDialog {
  setVisible(visible: boolean): void;
  dispose(): void;
}

interface PickerBuilder {
  addView(view: PickerView): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setMaxItems(max: number): PickerBuilder;
  setSelectableMimeTypes(types: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(callback: (response: unknown) => void): PickerBuilder;
  build(): PickerDialog;
}

export interface GooglePickerSdk {
  DocsView: new (viewId: string) => PickerView;
  PickerBuilder: new () => PickerBuilder;
  ViewId: { DOCS: string };
  Action: { PICKED: string; CANCEL: string; ERROR: string };
}

interface GoogleApiLoader {
  load(module: 'picker', options: {
    callback: () => void;
    onerror: () => void;
    timeout: number;
    ontimeout: () => void;
  }): void;
}

function getPickerSdk(): GooglePickerSdk | undefined {
  const sdk = (window as Window & { google?: { picker?: GooglePickerSdk } }).google?.picker;
  return sdk?.PickerBuilder && sdk.DocsView && sdk.ViewId && sdk.Action ? sdk : undefined;
}

function getApiLoader(): GoogleApiLoader | undefined {
  return (window as Window & { gapi?: GoogleApiLoader }).gapi;
}

let sdkPromise: Promise<GooglePickerSdk> | null = null;

/** Load only Picker, without replacing the GIS-owned google.accounts namespace. */
export function loadGooglePickerSdk(): Promise<GooglePickerSdk> {
  try { assertGoogleDriveHostAllowed(); }
  catch (error) { return Promise.reject(error); }
  if (!getGoogleDrivePickerConfig()) return Promise.reject(new Error('The Google Drive picker is not configured for this viewer.'));
  const existing = getPickerSdk();
  if (existing) return Promise.resolve(existing);
  if (sdkPromise) return sdkPromise;
  const pending = new Promise<GooglePickerSdk>((resolve, reject) => {
    let script: HTMLScriptElement | undefined;
    let settled = false;
    const timer = setTimeout(() => finish(), 30_000);
    const finish = (sdk?: GooglePickerSdk) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (script) {
        script.onload = null;
        script.onerror = null;
      }
      if (sdk) resolve(sdk);
      else {
        script?.remove();
        reject(new Error(PICKER_LOAD_ERROR));
      }
    };
    const loadPicker = () => {
      if (settled) return;
      const gapi = getApiLoader();
      if (!gapi?.load) return finish();
      try {
        gapi.load('picker', {
          callback: () => finish(getPickerSdk()), onerror: () => finish(),
          timeout: 30_000, ontimeout: () => finish(),
        });
      } catch { finish(); }
    };
    if (getApiLoader()?.load) loadPicker();
    else {
      script = document.createElement('script');
      script.src = PICKER_SCRIPT_URL;
      script.async = true;
      script.onload = loadPicker;
      script.onerror = () => finish();
      document.head.append(script);
    }
  });
  sdkPromise = pending;
  void pending.catch(() => { if (sdkPromise === pending) sdkPromise = null; });
  return pending;
}

export function getGoogleDrivePickerConfig(): GoogleDrivePickerConfig | null {
  const { apiKey, clientId, appId } = getGoogleDriveConfiguration();
  if (!apiKey || !clientId || !appId) return null;
  return { apiKey, clientId, appId };
}

/** Validate the provider's selection and retain only the file reference. */
export function parseGoogleDriveArchiveSelection(value: unknown): GoogleDriveArchiveSelection {
  const item = value as { id?: unknown; name?: unknown; resourceKey?: unknown; driveSuccess?: unknown; driveError?: unknown } | null;
  if (!item || typeof item.id !== 'string' || !SAFE_DRIVE_ID.test(item.id)
    || typeof item.name !== 'string' || !item.name || item.name.length > 1024
    || Array.from(item.name).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new Error('The Google Drive picker returned an invalid file. Choose the archive again.');
  }
  if (!isGoogleDriveArchiveFilename(item.name)) throw new Error('Choose a ZIP or TAR archive, including supported compressed TAR formats, in the Google Drive picker.');
  if (item.driveSuccess === false || (item.driveError !== undefined && item.driveError !== null && item.driveError !== 0 && item.driveError !== '0' && item.driveError !== '')) {
    throw new Error('Google Drive could not grant access to this archive. Choose it again and check the account and download permissions.');
  }
  if (item.resourceKey !== undefined && item.resourceKey !== ''
    && (typeof item.resourceKey !== 'string' || !SAFE_DRIVE_ID.test(item.resourceKey))) {
    throw new Error('The Google Drive picker returned an invalid file resource key. Choose the archive again.');
  }
  const resourceKey = item.resourceKey as string | undefined;
  const url = new URL(`https://drive.google.com/file/d/${item.id}/view`);
  if (resourceKey) url.searchParams.set('resourcekey', resourceKey);
  return { fileId: item.id, name: item.name, ...(resourceKey ? { resourceKey } : {}), url: url.href };
}

interface ChooseGoogleDriveArchiveOptions {
  signal?: AbortSignal;
  onOpen?: () => void;
  sdk?: GooglePickerSdk;
}

let pickerActive = false;

/** Cancel returns null; a disconnected/expired account needs an explicit new sign-in. */
export async function chooseGoogleDriveArchive(options: ChooseGoogleDriveArchiveOptions = {}): Promise<GoogleDriveArchiveSelection | null> {
  if (options.signal?.aborted) return null;
  assertGoogleDriveHostAllowed();
  const config = getGoogleDrivePickerConfig();
  if (!config) throw new Error('The Google Drive picker needs an API key, OAuth client ID, and numeric Cloud project number. Contact the site administrator.');
  if (!googleDriveAuth.getAccessToken()) throw new Error('Sign in with the Google Drive icon, then choose an archive in the Drive picker.');
  if (pickerActive) throw new Error('A Google Drive picker is already open. Finish or cancel it before choosing another archive.');
  pickerActive = true;
  try {
    return await new Promise<GoogleDriveArchiveSelection | null>((resolve, reject) => {
      let picker: PickerDialog | undefined;
      let settled = false;
      const dispose = () => {
        const current = picker;
        picker = undefined;
        if (!current) return;
        try { current.setVisible(false); } catch { /* Cleanup must not expose provider errors. */ }
        try { current.dispose(); } catch { /* The provider may already have disposed it. */ }
      };
      const finish = (selection: GoogleDriveArchiveSelection | null, error?: Error) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener('abort', cancel);
        unsubscribe();
        dispose();
        if (error) reject(error);
        else resolve(selection);
      };
      const cancel = () => finish(null);
      const checkAccount = () => {
        if (settled) return;
        if (!googleDriveAuth.getAccessToken()) finish(null, new Error('Google Drive sign-in expired or disconnected. Sign in again, then choose an archive in the Drive picker.'));
      };
      options.signal?.addEventListener('abort', cancel, { once: true });
      const unsubscribe = googleDriveAuth.subscribe(checkAccount);
      const load = options.sdk ? Promise.resolve(options.sdk) : loadGooglePickerSdk();
      void load.then(sdk => {
        if (settled) return;
        if (options.signal?.aborted) return cancel();
        const token = googleDriveAuth.getAccessToken();
        if (!token) return checkAccount();
        try {
          const view = new sdk.DocsView(sdk.ViewId.DOCS)
            .setMimeTypes(GOOGLE_DRIVE_ARCHIVE_MIME_TYPES).setIncludeFolders(true).setSelectFolderEnabled(false);
          picker = new sdk.PickerBuilder()
            .addView(view).setDeveloperKey(config.apiKey).setAppId(config.appId)
            .setOAuthToken(token).setOrigin(window.location.origin).setMaxItems(1)
            .setSelectableMimeTypes(GOOGLE_DRIVE_ARCHIVE_MIME_TYPES).setTitle('Choose a dataset archive')
            .setCallback((response: unknown) => {
              if (settled) return;
              const data = response as { action?: unknown; docs?: unknown } | null;
              if (data?.action === sdk.Action.CANCEL) return cancel();
              if (data?.action === sdk.Action.ERROR) return finish(null, new Error('The Google Drive picker could not open this file. Sign in again or choose the archive again.'));
              if (data?.action !== sdk.Action.PICKED) return;
              checkAccount();
              if (settled) return;
              if (!Array.isArray(data.docs) || data.docs.length !== 1) return finish(null, new Error('Choose exactly one ZIP or TAR archive in the Google Drive picker.'));
              try { finish(parseGoogleDriveArchiveSelection(data.docs[0])); }
              catch (error) { finish(null, error instanceof Error ? error : new Error('Choose an archive in the Google Drive picker.')); }
            }).build();
          if (settled) return dispose();
          options.onOpen?.();
          if (settled) return dispose();
          picker.setVisible(true);
        } catch { finish(null, new Error('Could not open the Google Drive picker. Check the viewer configuration and try again.')); }
      }, () => finish(null, new Error(PICKER_LOAD_ERROR)));
    });
  } finally { pickerActive = false; }
}
