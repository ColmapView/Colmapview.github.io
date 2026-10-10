import { useId } from 'react';
import { hfAuth } from '../../features/huggingface/auth';
import { describeHfAccess, type HfConfig } from '../../features/huggingface/config';
import { getButtonClass } from '../../theme';
import { AccountDialog } from '../ui/AccountDialog';
import { useHuggingFaceAccountStoreFacade } from './useHuggingFaceAccountStoreFacade';

interface HuggingFaceAccountDialogProps {
  config: HfConfig;
  isOpen: boolean;
  onClose: () => void;
}

/** Read-only builds have no publishing dialog, so a loaded scene signs in again here once the session expires. */
export function HuggingFaceAccountDialog({ config, isOpen, onClose }: HuggingFaceAccountDialogProps) {
  const id = useId();
  const { hf } = useHuggingFaceAccountStoreFacade();
  const connected = hf.status === 'connected';
  const connecting = hf.status === 'connecting';
  const close = () => {
    if (connecting) hfAuth.disconnect();
    onClose();
  };
  return <AccountDialog id={id} isOpen={isOpen} onClose={close} title="Hugging Face" connected={connected}
      status={connected || connecting ? connected ? `Connected as ${hf.identity?.username}` : 'Waiting for sign-in…' : null}
      statusTitle={hf.identity?.username}
      description={connected ? 'Load private datasets with this account.' : 'Sign in to open private datasets.'}
      hint={!connected ? describeHfAccess(config) : null} error={hf.error}>
      {connected || connecting
        ? <button type="button" className={getButtonClass('ghost', 'sm')} onClick={() => hfAuth.disconnect()}>
          {connected ? 'Disconnect' : 'Cancel sign-in'}
        </button>
        : <button type="button" aria-label="Sign in with Hugging Face" className={getButtonClass('primary', 'sm')} onClick={() => { void hfAuth.connect(config); }}>
          Sign in
        </button>}
    </AccountDialog>;
}
