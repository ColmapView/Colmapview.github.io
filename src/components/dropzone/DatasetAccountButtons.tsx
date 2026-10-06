import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { hfAuth } from '../../features/huggingface/auth';
import { getHfAccountConfiguration } from '../../features/huggingface/config';
import { googleDriveAuth, loadGoogleOAuthSdk, type GoogleOAuthSdk } from '../../features/googleDrive/auth';
import { chooseGoogleDriveArchive, getGoogleDrivePickerConfig } from '../../features/googleDrive/picker';
import { GOOGLE_DRIVE_ENABLED_ORIGIN, getGoogleDriveConfiguration, isGoogleDriveEnabled } from '../../features/googleDrive/config';
import { floatingPanelStyles, getButtonClass, modalStyles, panelStyles, Z_INDEX } from '../../theme';
import { CheckIcon, CloseIcon, GoogleDriveIcon } from '../../icons';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { PolicyLinks } from '../PolicyLinks';
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
  const clientId = getGoogleDrivePickerConfig()?.clientId;
  const googleApiKey = getGoogleDriveConfiguration().apiKey;
  const canLoadGoogleDriveUrl = Boolean(googleApiKey) || google.status === 'connected';
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
      : googleApiKey ? 'Load a public dataset by URL.'
        : canLoadGoogleDriveUrl ? 'Load a previously authorized dataset by URL.' : 'Google Drive loading is unavailable in this viewer.'
    : connected ? 'Load a public or private dataset.' : 'Sign in to open private datasets.';
  const hint = provider === 'google'
    ? clientId ? 'Access is limited to files you choose. Downloads go directly to this browser.'
      : googleApiKey ? 'Private file selection is unavailable. You can load public datasets by URL.'
        : 'Private file selection is unavailable.'
    : hfConfiguration.status === 'ready'
      ? hfConfiguration.config.readOnly
        ? 'Allows reading your repositories, including private datasets.'
        : 'Allows reading private repositories and creating datasets with this app.'
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
    cancelPicker();
    if (auth.status === 'connecting') {
      if (provider === 'google') googleDriveAuth.disconnect();
      else hfAuth.disconnect();
    }
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
      <span aria-hidden="true" className="text-base leading-none">🤗</span>
    </button>
    {googleEnabled ? <button type="button" className={DROP_ZONE_ICON_BUTTON_CLASS} aria-label="Google Drive account"
      data-tooltip={clientId ? 'Choose archive from Google Drive' : 'Google Drive'}
      aria-pressed={google.status === 'connected'} onClick={() => { setPickerError(null); setProvider('google'); }}>
      <GoogleDriveIcon />
    </button> : <a href={GOOGLE_DRIVE_ENABLED_ORIGIN} className={`${getButtonClass('ghost', 'sm')} whitespace-nowrap`}
      aria-label="Use Google Drive" data-tooltip="Use Google Drive on colmapview.opsiclear.com">
      <GoogleDriveIcon className="w-4 h-4" /><span>Use Google Drive</span>
    </a>}
    <ModalDialogShell isOpen={provider !== null && (provider !== 'google' || googleEnabled) && !pickerOpen} onClose={close} ariaLabelledBy={`${id}-title`}
      ariaDescribedBy={`${id}-description`}
      overlayClassName={`${panelStyles.overlay} p-4`} overlayStyle={{ zIndex: Z_INDEX.modalOverlay }}
      panelClassName={`${floatingPanelStyles.dialog} w-full max-w-sm overflow-hidden`} panelStyle={{ maxHeight: '90dvh' }}>
      <div className={`${modalStyles.popupHeader} flex-shrink-0`}>
        <h3 id={`${id}-title`} className={modalStyles.toolHeaderTitle}>{title}</h3>
        <button type="button" className={modalStyles.toolHeaderClose} aria-label="Close account dialog" onClick={close}>
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className={`${panelStyles.scrollBody} text-sm`}>
        {(connected || connecting || pickerLoading) && <div role="status" className="flex items-center gap-1.5 mb-2 text-ds-primary">
          {connected && <CheckIcon className="w-3.5 h-3.5 text-ds-success flex-shrink-0" />}
          <span className="min-w-0 truncate" title={provider === 'hf' ? hf.identity?.username : undefined}>
            {provider === 'google' && connected && pickerLoading ? 'Opening Drive picker…'
              : connected ? provider === 'hf' && hf.identity?.username ? `Connected as ${hf.identity.username}` : 'Connected' : 'Waiting for sign-in…'}
          </span>
        </div>}
        <p id={`${id}-description`} className="m-0 text-ds-secondary">
          {!canSignIn && provider === 'hf' && !connected ? 'Load a public dataset by URL.' : description}
        </p>
        {(!connected || provider === 'google') && <p className="m-0 mt-1 text-ds-muted text-xs">{hint}</p>}
        <PolicyLinks align="start" />
        {(auth.error || (provider === 'google' && (sdkError || pickerError))) && <p role="alert" className="m-0 mt-3 text-ds-warning text-xs">
          {auth.error || sdkError || pickerError}
        </p>}
        <div className="flex flex-wrap items-center justify-end gap-2 mt-4">
          {provider === 'google' ? <>
            {(connected || connecting || pickerLoading) && <button type="button" className={getButtonClass('ghost', 'sm')}
              onClick={pickerLoading && !connecting ? cancelPicker : disconnect}>
              {connecting ? 'Cancel sign-in' : pickerLoading ? 'Cancel selection' : 'Disconnect'}
            </button>}
            {canLoadGoogleDriveUrl && <button type="button" className={getButtonClass(clientId ? 'ghost' : 'primary', 'sm')}
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
            <button type="button" className={getButtonClass(connecting ? 'secondary' : 'primary', 'sm')}
              onClick={() => { close(); onOpenUrlModal(); }}>Load URL</button>
          </> : <>
            <button type="button" className={getButtonClass(canSignIn ? 'ghost' : 'primary', 'sm')}
              onClick={() => { close(); onOpenUrlModal(); }}>Load URL</button>
            {provider === 'hf' && hfConfiguration.status === 'ready' ? <button type="button" className={getButtonClass('primary', 'sm')}
                onClick={() => { void hfAuth.connect(hfConfiguration.config); }}>Sign in with Hugging Face</button> : null}
          </>}
        </div>
      </div>
    </ModalDialogShell>
  </>;
}
