import { useId, useState } from 'react';
import { hfAuth } from '../../features/huggingface/auth';
import { describeHfAccess, type HfConfig } from '../../features/huggingface/config';
import { getButtonClass } from '../../theme';
import { AccountDialog } from '../ui/AccountDialog';
import { ControlButton, type PanelType } from './ControlComponents';
import { useHuggingFaceAccountButtonStoreFacade } from './useHuggingFaceAccountButtonStoreFacade';

interface HuggingFaceAccountButtonProps {
  config: HfConfig;
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

/** Read-only builds have no publishing dialog, so a loaded scene signs in again here once the session expires. */
export function HuggingFaceAccountButton({ config, activePanel, setActivePanel }: HuggingFaceAccountButtonProps) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const { hf } = useHuggingFaceAccountButtonStoreFacade();
  const connected = hf.status === 'connected';
  const connecting = hf.status === 'connecting';
  const close = () => {
    if (connecting) hfAuth.disconnect();
    setIsOpen(false);
  };
  return <>
    <ControlButton panelId="publish" activePanel={activePanel} setActivePanel={setActivePanel}
      icon={<span aria-hidden="true" className="text-base leading-none">🤗</span>}
      tooltip={connected ? `Hugging Face: ${hf.identity?.username}` : 'Hugging Face account'}
      isActive={isOpen || connected} onClick={() => { setActivePanel(null); setIsOpen(true); }} />
    <AccountDialog id={id} isOpen={isOpen} onClose={close} title="Hugging Face" connected={connected}
      status={connected || connecting ? connected ? `Connected as ${hf.identity?.username}` : 'Waiting for sign-in…' : null}
      statusTitle={hf.identity?.username}
      description={connected ? 'Files from private datasets load with this account.' : 'Sign in to keep loading files from private datasets.'}
      hint={!connected ? describeHfAccess(config) : null} error={hf.error}>
      {connected || connecting
        ? <button type="button" className={getButtonClass('ghost', 'sm')} onClick={() => hfAuth.disconnect()}>
          {connected ? 'Disconnect' : 'Cancel sign-in'}
        </button>
        : <button type="button" className={getButtonClass('primary', 'sm')} onClick={() => { void hfAuth.connect(config); }}>
          Sign in with Hugging Face
        </button>}
    </AccountDialog>
  </>;
}
