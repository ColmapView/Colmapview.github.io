import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { hfAuth } from '../../features/huggingface/auth';
import { describeHfAccess, getHfAccountConfiguration } from '../../features/huggingface/config';
import { startupLinkRetry } from '../../appStartupRetry';
import { googleDriveAuth, loadGoogleOAuthSdk, type GoogleOAuthSdk } from '../../features/googleDrive/auth';
import { chooseGoogleDriveArchive, getGoogleDrivePickerConfig } from '../../features/googleDrive/picker';
import { GOOGLE_DRIVE_ENABLED_ORIGIN, getGoogleDriveConfiguration, isGoogleDriveEnabled } from '../../features/googleDrive/config';
import { getButtonClass } from '../../theme';
import { GoogleDriveIcon } from '../../icons';
import { AccountDialog } from '../ui/AccountDialog';
import { DROP_ZONE_ICON_BUTTON_CLASS } from './dropZonePanelViewModel';

interface DatasetAccountButtonsProps {
  onOpenUrlModal: () => void;
  onLoadGoogleDriveArchive: (url: string) => void;
}
type Provider = 'google' | 'hf';

export function DatasetAccountButtons({ onOpenUrlModal, onLoadGoogleDriveArchive }: DatasetAccountButtonsProps) {
  const id = useId();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [sdk, setSdk] = useState<GoogleOAuthSdk | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [sdkAttempt, setSdkAttempt] = useState(0);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const pickerAbortRef = useRef<AbortController | null>(null);
  const signInUnsubscribeRef = useRef<(() => void) | null>(null);
  const google = useSyncExternalStore(googleDriveAuth.subscribe, googleDriveAuth.getSnapshot);
  const hf = useSyncExternalStore(hfAuth.subscribe, hfAuth.getSnapshot);
  // A shared link's dataset URL is hidden in its fragment, and a reload would drop the sign-in.
  const retryLink = useSyncExternalStore(startupLinkRetry.subscribe, startupLinkRetry.getSnapshot);
  const clientId = getGoogleDrivePickerConfig()?.clientId;
  // Drive URLs load with the API key; a reader session exists only through the picker, which needs the key too.
  const googleApiKey = getGoogleDriveConfiguration().apiKey;
  const googleEnabled = isGoogleDriveEnabled();
  const hfConfiguration = getHfAccountConfiguration();
  const title = provider === 'google' ? 'Google Drive' : 'Hugging Face';
  const auth = provider === 'google' ? google : hf;
  const connected = auth.status === 'connected';
  const connecting = auth.status === 'connecting';
  const canSignIn = provider === 'google' ? Boolean(clientId) : hfConfiguration.status === 'ready';
  const description = provider === 'google'
    ? clientId
      ? connected ? 'Choose a ZIP or TAR dataset from Google Drive.' : 'Choose a ZIP or TAR from Drive. Sign in to open private files.'
      : googleApiKey ? 'Load a public dataset by URL.' : 'Google Drive loading is unavailable in this viewer.'
    : connected ? 'Load a public or private dataset.' : canSignIn ? 'Sign in to open private datasets.' : 'Load a public dataset by URL.';
  const hint = provider === 'google'
    ? clientId ? 'Access is limited to files you choose. Downloads go directly to this browser.'
      : googleApiKey ? 'Private file selection is unavailable. You can load public datasets by URL.'
        : 'Private file selection is unavailable.'
    : hfConfiguration.status === 'ready'
      ? describeHfAccess(hfConfiguration.config)
      : 'Hugging Face sign-in is unavailable in this viewer.';
  const cancelPicker = () => {
    signInUnsubscribeRef.current?.();
    signInUnsubscribeRef.current = null;
    const controller = pickerAbortRef.current;
    pickerAbortRef.current = null;
    controller?.abort();
    setPickerLoading(false);
    setPickerOpen(false);
  };
  const disconnect = () => {
    cancelPicker();
    if (provider === 'google') googleDriveAuth.disconnect(); else hfAuth.disconnect();
  };
  const close = () => {
    // Closing abandons a pending sign-in, so Load URL (which closes this dialog) waits for it to settle.
    if (auth.status === 'connecting') disconnect(); else cancelPicker();
    setProvider(null);
  };
  const openPicker = () => {
    const controller = new AbortController();
    pickerAbortRef.current = controller;
    setPickerLoading(true);
    void chooseGoogleDriveArchive({
      signal: controller.signal,
      // Restore the account opener's focus before Google's dialog takes focus.
      onOpen: () => { if (!controller.signal.aborted) flushSync(() => setPickerOpen(true)); },
    }).then(selection => {
      if (!selection || controller.signal.aborted || pickerAbortRef.current !== controller) return;
      setProvider(null);
      onLoadGoogleDriveArchive(selection.url);
    }).catch(error => {
      if (controller.signal.aborted || pickerAbortRef.current !== controller) return;
      setPickerError(error instanceof Error ? error.message : 'Could not open Google Drive. Try again.');
    }).finally(() => {
      if (pickerAbortRef.current !== controller) return;
      pickerAbortRef.current = null;
      setPickerLoading(false);
      setPickerOpen(false);
    });
  };
  const chooseArchive = () => {
    if (!clientId || pickerLoading || connecting || pickerAbortRef.current || signInUnsubscribeRef.current) return;
    setPickerError(null);
    if (connected) {
      openPicker();
      return;
    }
    if (!sdk) return;
    setPickerLoading(true);
    let signInStarted = false;
    signInUnsubscribeRef.current = googleDriveAuth.subscribe(() => {
      const next = googleDriveAuth.getSnapshot();
      if (next.status === 'connecting') { signInStarted = true; return; }
      // connect clears the previous session before starting authorization.
      if (next.status === 'disconnected' && !next.error && !signInStarted) return;
      signInUnsubscribeRef.current?.();
      signInUnsubscribeRef.current = null;
      if (next.status === 'connected') openPicker();
      else setPickerLoading(false);
    });
    googleDriveAuth.connect(clientId, sdk);
  };

  useEffect(() => () => {
    signInUnsubscribeRef.current?.();
    pickerAbortRef.current?.abort();
    pickerAbortRef.current = null;
  }, []);

  useEffect(() => {
    if (provider !== 'google' || !clientId) return;
    let cancelled = false;
    void loadGoogleOAuthSdk().then(value => { if (!cancelled) { setSdk(value); setSdkError(null); } }, () => {
      if (!cancelled) setSdkError('Could not load Google sign-in. Check your connection and try again.');
    });
    return () => { cancelled = true; };
  }, [provider, clientId, sdkAttempt]);

  return <>
    <button type="button" className={DROP_ZONE_ICON_BUTTON_CLASS} aria-label="Hugging Face account"
      data-tooltip={hf.status === 'connected' ? `Hugging Face: ${hf.identity?.username}` : 'Sign in with Hugging Face'}
      aria-pressed={hf.status === 'connected'} onClick={() => setProvider('hf')}>
      <span aria-hidden="true" className="startup-account-emoji">🤗</span>
    </button>
    {googleEnabled ? <button type="button" className={DROP_ZONE_ICON_BUTTON_CLASS} aria-label="Google Drive account"
      data-tooltip={clientId ? 'Choose archive from Google Drive' : 'Google Drive'}
      aria-pressed={google.status === 'connected'} onClick={() => { setPickerError(null); setProvider('google'); }}>
      <GoogleDriveIcon className="w-4 h-4" />
    </button> : <a href={GOOGLE_DRIVE_ENABLED_ORIGIN} className={DROP_ZONE_ICON_BUTTON_CLASS}
      target="_blank" rel="noopener noreferrer" aria-label="Use Google Drive" data-tooltip="Use Google Drive on colmapview.opsiclear.com">
      <GoogleDriveIcon className="w-4 h-4" />
    </a>}
    <AccountDialog id={id} isOpen={provider !== null && (provider !== 'google' || googleEnabled) && !pickerOpen}
      onClose={close} title={title} connected={connected}
      status={connected || connecting || pickerLoading
        ? provider === 'google' && connected && pickerLoading ? 'Opening Drive picker…'
          : connected ? provider === 'hf' && hf.identity?.username ? `Connected as ${hf.identity.username}` : 'Connected' : 'Waiting for sign-in…'
        : null}
      statusTitle={provider === 'hf' ? hf.identity?.username : undefined} description={description}
      hint={!connected || provider === 'google' ? hint : null}
      error={auth.error || (provider === 'google' ? sdkError || pickerError : null)}>
      {provider === 'google' ? <>
        {(connected || connecting || pickerLoading) && <button type="button" className={getButtonClass('ghost', 'sm')}
          onClick={pickerLoading && !connecting ? cancelPicker : disconnect}>
          {connecting ? 'Cancel sign-in' : pickerLoading ? 'Cancel selection' : 'Disconnect'}
        </button>}
        {googleApiKey && <button type="button" disabled={connecting}
          className={getButtonClass(clientId ? 'ghost' : 'primary', 'sm', connecting)}
          onClick={() => { close(); onOpenUrlModal(); }}>Load URL</button>}
        {clientId && (sdkError && !connected
          ? <button type="button" className={getButtonClass('primary', 'sm')} onClick={() => {
            setSdkError(null); setSdkAttempt(value => value + 1);
          }}>Retry sign-in</button>
          : <button type="button" disabled={(!connected && !sdk) || connecting || pickerLoading}
            className={getButtonClass('primary', 'sm', (!connected && !sdk) || connecting || pickerLoading)}
            onClick={chooseArchive}>{!connected && !sdk ? 'Loading sign-in…' : 'Choose archive from Drive'}</button>)}
      </> : connected || connecting ? <>
        <button type="button" className={getButtonClass('ghost', 'sm')} onClick={disconnect}>
          {connected ? 'Disconnect' : 'Cancel sign-in'}
        </button>
        <button type="button" disabled={connecting}
          className={getButtonClass(connecting ? 'secondary' : retryLink ? 'ghost' : 'primary', 'sm', connecting)}
          onClick={() => { close(); onOpenUrlModal(); }}>Load URL</button>
        {connected && retryLink && <button type="button" className={getButtonClass('primary', 'sm')}
          onClick={() => { close(); void retryLink(); }}>Retry shared link</button>}
      </> : <>
        <button type="button" className={getButtonClass(canSignIn ? 'ghost' : 'primary', 'sm')}
          onClick={() => { close(); onOpenUrlModal(); }}>Load URL</button>
        {provider === 'hf' && hfConfiguration.status === 'ready' ? <button type="button" className={getButtonClass('primary', 'sm')}
            onClick={() => { void hfAuth.connect(hfConfiguration.config); }}>Sign in with Hugging Face</button> : null}
      </>}
    </AccountDialog>
  </>;
}
