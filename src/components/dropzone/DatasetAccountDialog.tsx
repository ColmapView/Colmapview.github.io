import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { hfAuth } from '../../features/huggingface/auth';
import { describeHfAccess, getHfAccountConfiguration } from '../../features/huggingface/config';
import { startupLinkRetry } from '../../appStartupRetry';
import { googleDriveAuth, loadGoogleOAuthSdk, type GoogleOAuthSdk } from '../../features/googleDrive/auth';
import { chooseGoogleDriveArchive, getGoogleDrivePickerConfig } from '../../features/googleDrive/picker';
import { getGoogleDriveConfiguration, isGoogleDriveEnabled } from '../../features/googleDrive/config';
import { getButtonClass, Z_INDEX } from '../../theme';
import { AccountDialog } from '../ui/AccountDialog';

export type DatasetAccountProvider = 'google' | 'hf';

interface DatasetAccountDialogProps {
  provider: DatasetAccountProvider | null;
  onClose: () => void;
  onOpenUrlModal: () => void;
  onLoadRemoteDataset: (url: string) => void;
  accessMessage?: string;
  retryLoad?: () => Promise<void>;
}

/** Manual account entry and failed storage loads use the same sign-in and Picker lifecycle. */
export function DatasetAccountDialog({ provider, onClose, onOpenUrlModal, onLoadRemoteDataset,
  accessMessage, retryLoad }: DatasetAccountDialogProps) {
  const id = useId();
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
  const sharedLinkRetry = useSyncExternalStore(startupLinkRetry.subscribe, startupLinkRetry.getSnapshot);
  const retryLink = retryLoad ?? sharedLinkRetry;
  const clientId = getGoogleDrivePickerConfig()?.clientId;
  // Drive URLs need an API key; private archive selection also needs a matching Picker configuration.
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
      ? connected ? 'Choose a ZIP or TAR file from Google Drive.' : 'Sign in to choose a ZIP or TAR file from Google Drive.'
      : googleApiKey ? 'Load a public dataset by URL.' : 'Google Drive loading is unavailable in this viewer.'
    : connected ? 'Load a public or private dataset.' : canSignIn ? 'Sign in to open private datasets.' : 'Load a public dataset by URL.';
  const driveAccessHint = connected
    ? 'Select the file to let ColmapView open it.'
    : 'Sign in with an account that has access to this file.';
  const hint = provider === 'google'
    ? clientId ? accessMessage ? driveAccessHint : 'Only files you choose or create here are accessible. Downloads go directly to your browser.'
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
    onClose();
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
      onClose();
      onLoadRemoteDataset(selection.url);
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
      if (next.status === 'connected' && retryLoad) {
        // App-created or previously selected files may already be accessible with this session.
        // A denied retry offers this dialog again, connected and ready for explicit file selection.
        setPickerLoading(false);
        onClose();
        void retryLoad();
      } else if (next.status === 'connected') openPicker();
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

  return (<>
    <AccountDialog id={id} isOpen={provider !== null && (provider !== 'google' || googleEnabled) && !pickerOpen}
      onClose={close} title={title} connected={connected}
      status={connected || connecting || pickerLoading
        ? provider === 'google' && connected && pickerLoading ? 'Opening Drive picker…'
          : connected ? provider === 'hf' && hf.identity?.username ? `Connected as ${hf.identity.username}` : 'Connected' : 'Waiting for sign-in…'
        : null}
      statusTitle={provider === 'hf' ? hf.identity?.username : undefined} description={accessMessage ?? description}
      hint={!connected || provider === 'google' ? hint : null}
      error={auth.error || (provider === 'google' ? sdkError || pickerError : null)}>
      {provider === 'google' ? <>
        {(connected || connecting || pickerLoading) && <button type="button" className={getButtonClass('ghost', 'sm')}
          onClick={pickerLoading && !connecting ? cancelPicker : disconnect}>
          {connecting ? 'Cancel sign-in' : pickerLoading ? 'Cancel selection' : 'Disconnect'}
        </button>}
        {googleApiKey && <button type="button" disabled={connecting}
          className={getButtonClass(clientId ? 'ghost' : 'primary', 'sm', connecting)}
          onClick={() => { close(); onOpenUrlModal(); }}>{accessMessage ? 'Use another link' : 'Load URL'}</button>}
        {clientId && (sdkError && !connected
          ? <button type="button" className={getButtonClass('primary', 'sm')} onClick={() => {
            setSdkError(null); setSdkAttempt(value => value + 1);
          }}>Retry sign-in</button>
          : <button type="button" aria-label={!connected && !sdk ? undefined : connected ? 'Choose file from Drive' : 'Sign in with Google'} disabled={(!connected && !sdk) || connecting || pickerLoading}
            className={getButtonClass('primary', 'sm', (!connected && !sdk) || connecting || pickerLoading)}
            onClick={chooseArchive}>{!connected && !sdk ? 'Loading sign-in…' : connecting ? 'Signing in…' : pickerLoading ? 'Opening Drive…' : connected ? 'Choose file' : 'Sign in'}</button>)}
      </> : connected || connecting ? <>
        <button type="button" className={getButtonClass('ghost', 'sm')} onClick={disconnect}>
          {connected ? 'Disconnect' : 'Cancel sign-in'}
        </button>
        <button type="button" disabled={connecting}
          className={getButtonClass(connecting ? 'secondary' : retryLink ? 'ghost' : 'primary', 'sm', connecting)}
          onClick={() => { close(); onOpenUrlModal(); }}>Load URL</button>
        {connected && retryLink && <button type="button" className={getButtonClass('primary', 'sm')}
          onClick={() => { close(); void retryLink(); }}>{retryLoad ? 'Retry loading' : 'Retry shared link'}</button>}
      </> : <>
        <button type="button" className={getButtonClass(canSignIn ? 'ghost' : 'primary', 'sm')}
          onClick={() => { close(); onOpenUrlModal(); }}>Load URL</button>
        {provider === 'hf' && hfConfiguration.status === 'ready' ? <button type="button" aria-label="Sign in with Hugging Face" className={getButtonClass('primary', 'sm')}
            onClick={() => { void hfAuth.connect(hfConfiguration.config); }}>Sign in</button> : null}
      </>}
    </AccountDialog>
    {provider === 'google' && pickerOpen && createPortal(
      <button type="button" className={`${getButtonClass('secondary', 'sm')} fixed bottom-4 right-4`}
        style={{ zIndex: Z_INDEX.providerDialogControl }} aria-label="Cancel Drive file selection" onClick={cancelPicker}>
        Cancel selection
      </button>, document.body)}
  </>);
}
