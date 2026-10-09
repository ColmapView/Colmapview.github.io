import type { ReactNode } from 'react';
import { floatingPanelStyles, modalStyles, panelStyles, Z_INDEX } from '../../theme';
import { CheckIcon, CloseIcon } from '../../icons';
import { ModalDialogShell } from './ModalDialogShell';
import { PolicyLinks } from '../PolicyLinks';

interface AccountDialogProps {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  title: string;
  status: string | null;
  statusTitle?: string;
  connected: boolean;
  description: string;
  hint?: string | null;
  error?: string | null;
  children: ReactNode;
}

/** Account status, requested access and actions share the same accessible dialog layout. */
export function AccountDialog({ id, isOpen, onClose, title, status, statusTitle, connected,
  description, hint, error, children }: AccountDialogProps) {
  return <ModalDialogShell isOpen={isOpen} onClose={onClose} ariaLabelledBy={`${id}-title`} ariaDescribedBy={`${id}-description`}
    overlayClassName={`${panelStyles.overlay} p-4`} overlayStyle={{ zIndex: Z_INDEX.modalOverlay }}
    panelClassName={`${floatingPanelStyles.dialog} w-full max-w-sm overflow-hidden`} panelStyle={{ maxHeight: '90dvh' }}>
    <div className={`${modalStyles.popupHeader} flex-shrink-0`}>
      <h3 id={`${id}-title`} className={modalStyles.toolHeaderTitle}>{title}</h3>
      <button type="button" className={modalStyles.toolHeaderClose} aria-label="Close account dialog" onClick={onClose}>
        <CloseIcon className="w-3.5 h-3.5" />
      </button>
    </div>
    <div className={`${panelStyles.scrollBody} text-sm`}>
      {status && <div role="status" className="flex items-center gap-1.5 mb-2 text-ds-primary">
        {connected && <CheckIcon className="w-3.5 h-3.5 text-ds-success flex-shrink-0" />}
        <span className="min-w-0 truncate" title={statusTitle}>{status}</span>
      </div>}
      <p id={`${id}-description`} className="m-0 text-ds-secondary">{description}</p>
      {hint && <p className="m-0 mt-1 text-ds-muted text-xs">{hint}</p>}
      <PolicyLinks />
      {error && <p role="alert" className="m-0 mt-3 text-ds-warning text-xs">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2 mt-4">{children}</div>
    </div>
  </ModalDialogShell>;
}
