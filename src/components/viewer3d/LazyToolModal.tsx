import { useEffect, useState, type ComponentType } from 'react';
import { useModalZIndex } from '../../hooks/useModalZIndex';
import { FloatingWindowShell } from '../ui/FloatingWindowShell';

export interface ToolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LazyToolModalProps extends ToolModalProps {
  title: string;
  load: () => Promise<{ default: ComponentType<ToolModalProps> }>;
}

function LoadingWindow({ title, error, retry, isOpen, onClose }: ToolModalProps & {
  title: string;
  error: boolean;
  retry: () => void;
}) {
  const { zIndex, bringToFront } = useModalZIndex(isOpen);
  return (
    <div onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    }}>
    <FloatingWindowShell
      isOpen={isOpen}
      title={title}
      onClose={onClose}
      overlayStyle={{ zIndex }}
      panelStyle={{ position: 'absolute', top: '25%', left: '35%', width: 320 }}
      onPanelPointerDown={bringToFront}
    >
      <div className="p-4">
        {error ? <>
          <p role="alert">This tool could not load.</p>
          <button type="button" onClick={retry}>Retry loading</button>
        </> : <p role="status">Loading {title.toLowerCase()}…</p>}
      </div>
    </FloatingWindowShell>
    </div>
  );
}

/** Import on first open; once loaded retain the component across close/reopen. */
export function LazyToolModal({ title, load, isOpen, onClose }: LazyToolModalProps) {
  const [activated, setActivated] = useState(isOpen);
  const [LoadedModal, setLoadedModal] = useState<ComponentType<ToolModalProps> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (isOpen && !activated) setActivated(true);

  useEffect(() => {
    if (!activated) return;
    let disposed = false;
    load().then(
      module => { if (!disposed) setLoadedModal(() => module.default); },
      () => { if (!disposed) setFailed(true); },
    );
    return () => { disposed = true; };
  }, [activated, attempt, load]);

  if (LoadedModal) return <LoadedModal isOpen={isOpen} onClose={onClose} />;
  if (!isOpen) return null;
  return <LoadingWindow title={title} isOpen={isOpen} onClose={onClose} error={failed} retry={() => {
    setFailed(false);
    setAttempt(value => value + 1);
  }} />;
}
