import { useId, useState } from 'react';
import { hfAuth } from '../../features/huggingface/auth';
import type { HfConfig } from '../../features/huggingface/config';
import { floatingPanelStyles, getButtonClass, modalStyles, panelStyles, Z_INDEX } from '../../theme';
import { CheckIcon, CloseIcon } from '../../icons';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { PolicyLinks } from '../PolicyLinks';
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
    <ModalDialogShell isOpen={isOpen} onClose={close} ariaLabelledBy={`${id}-title`} ariaDescribedBy={`${id}-description`}
      overlayClassName={`${panelStyles.overlay} p-4`} overlayStyle={{ zIndex: Z_INDEX.modalOverlay }}
      panelClassName={`${floatingPanelStyles.dialog} w-full max-w-sm overflow-hidden`} panelStyle={{ maxHeight: '90dvh' }}>
      <div className={`${modalStyles.popupHeader} flex-shrink-0`}>
        <h3 id={`${id}-title`} className={modalStyles.toolHeaderTitle}>Hugging Face</h3>
        <button type="button" className={modalStyles.toolHeaderClose} aria-label="Close account dialog" onClick={close}>
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className={`${panelStyles.scrollBody} text-sm`}>
        {(connected || connecting) && <div role="status" className="flex items-center gap-1.5 mb-2 text-ds-primary">
          {connected && <CheckIcon className="w-3.5 h-3.5 text-ds-success flex-shrink-0" />}
          <span className="min-w-0 truncate" title={hf.identity?.username}>
            {connected ? `Connected as ${hf.identity?.username}` : 'Waiting for sign-in…'}
          </span>
        </div>}
        <p id={`${id}-description`} className="m-0 text-ds-secondary">
          {connected ? 'Files from private datasets load with this account.' : 'Sign in to keep loading files from private datasets.'}
        </p>
        {/* The privacy policy promises that the account control states the access it requests. */}
        {!connected && <p className="m-0 mt-1 text-ds-muted text-xs">
          {config.readOnly
            ? 'Allows reading your repositories, including private datasets.'
            : 'Allows reading private repositories and creating datasets with this app.'}
        </p>}
        <PolicyLinks align="start" />
        {hf.error && <p role="alert" className="m-0 mt-3 text-ds-warning text-xs">{hf.error}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2 mt-4">
          {connected || connecting
            ? <button type="button" className={getButtonClass('ghost', 'sm')} onClick={() => hfAuth.disconnect()}>
              {connected ? 'Disconnect' : 'Cancel sign-in'}
            </button>
            : <button type="button" className={getButtonClass('primary', 'sm')} onClick={() => { void hfAuth.connect(config); }}>
              Sign in with Hugging Face
            </button>}
        </div>
      </div>
    </ModalDialogShell>
  </>;
}
