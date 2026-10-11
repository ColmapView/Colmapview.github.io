import { useEffect, useId, useState, type ComponentType } from 'react';
import { useModalZIndex } from '../../hooks/useModalZIndex';
import { CloseIcon } from '../../icons';
import { getButtonClass, modalStyles, panelStyles, Z_INDEX } from '../../theme';
import { FloatingWindowShell } from '../ui/FloatingWindowShell';
import { ModalDialogShell } from '../ui/ModalDialogShell';

export interface ToolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LazyToolModalProps extends ToolModalProps {
  title: string;
  load: () => Promise<{ default: ComponentType<ToolModalProps> }>;
  /** Match the loaded tool's focus and backdrop policy while it loads. */
  modal?: boolean;
}

function LoadingWindow({ title, error, modal, isOpen, onClose }: ToolModalProps & {
  title: string;
  error: boolean;
  modal: boolean;
}) {
  const titleId = useId();
  const { zIndex, bringToFront } = useModalZIndex(isOpen && !modal);
  const panelClassName = `${panelStyles.dialog} w-full max-w-xs overflow-hidden pointer-events-auto`;
  const panelStyle = { maxHeight: '90dvh' };
  const content = <div className={`${panelStyles.scrollBody} space-y-3 text-sm text-ds-primary`}>
    {error ? <>
      <p role="alert">This tool could not load.</p>
      <p>Reload the viewer to try again. Unsaved changes will be lost.</p>
      <button type="button" className={getButtonClass('primary', 'sm')} onClick={() => window.location.reload()}>Reload viewer</button>
    </> : <p role="status">Loading {title.toLowerCase()}…</p>}
  </div>;
  if (modal) return <ModalDialogShell isOpen={isOpen} onClose={onClose} ariaLabelledBy={titleId}
    overlayClassName={`${panelStyles.overlay} p-4`} overlayStyle={{ zIndex: Z_INDEX.modalOverlay }}
    panelClassName={panelClassName} panelStyle={panelStyle} closeOnBackdrop={false}>
    <header className={`${modalStyles.popupHeader} flex-shrink-0`}>
      <h2 id={titleId} className={modalStyles.toolHeaderTitle}>{title}</h2>
      <button type="button" className={modalStyles.toolHeaderClose} onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>
        <CloseIcon className="w-3.5 h-3.5" />
      </button>
    </header>
    {content}
  </ModalDialogShell>;
  return (
    <div onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    }}>
    <FloatingWindowShell
      isOpen={isOpen}
      title={title}
      onClose={onClose}
      overlayClassName="fixed inset-0 flex items-center justify-center p-4 pointer-events-none"
      overlayStyle={{ zIndex }}
      panelClassName={panelClassName}
      panelStyle={panelStyle}
      onPanelPointerDown={bringToFront}
    >
      {content}
    </FloatingWindowShell>
    </div>
  );
}

/** Import on first open; once loaded retain the component across close/reopen. */
export function LazyToolModal({ title, load, isOpen, onClose, modal = false }: LazyToolModalProps) {
  const [activated, setActivated] = useState(isOpen);
  const [LoadedModal, setLoadedModal] = useState<ComponentType<ToolModalProps> | null>(null);
  const [failed, setFailed] = useState(false);
  if (isOpen && !activated) setActivated(true);

  useEffect(() => {
    if (!activated) return;
    let disposed = false;
    load().then(
      module => { if (!disposed) setLoadedModal(() => module.default); },
      () => { if (!disposed) setFailed(true); },
    );
    return () => { disposed = true; };
  }, [activated, load]);

  if (LoadedModal) return <LoadedModal isOpen={isOpen} onClose={onClose} />;
  if (!isOpen) return null;
  // A failed dynamic import can remain cached; reload fetches modules in a fresh document.
  return <LoadingWindow title={title} isOpen={isOpen} onClose={onClose} modal={modal} error={failed} />;
}
