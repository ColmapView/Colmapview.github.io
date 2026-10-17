import { useEffect, useRef, useState } from 'react';
import { ModalDialogShell } from './ui/ModalDialogShell';
import { registerCameraDatasetSelector, type CameraDatasetCandidate } from '../dataset/importers/selection';

export function CameraDatasetSelectionHost() {
  const [choices, setChoices] = useState<readonly CameraDatasetCandidate[]>([]);
  const finish = useRef<((choice: CameraDatasetCandidate | null) => void) | null>(null);
  useEffect(() => {
    registerCameraDatasetSelector((candidates, signal) => new Promise(resolve => {
      finish.current?.(null);
      const settle = (choice: CameraDatasetCandidate | null) => {
        signal?.removeEventListener('abort', cancel);
        if (finish.current === settle) { finish.current = null; setChoices([]); }
        resolve(choice);
      };
      const cancel = () => settle(null);
      finish.current = settle;
      if (signal?.aborted) { cancel(); return; }
      signal?.addEventListener('abort', cancel, { once: true });
      setChoices(candidates);
    }));
    return () => { registerCameraDatasetSelector(null); finish.current?.(null); };
  }, []);
  return <ModalDialogShell isOpen={choices.length > 0} onClose={() => finish.current?.(null)}
    ariaLabelledBy="camera-dataset-selection-title" overlayClassName="fixed inset-0 z-modal bg-ds-void/60 flex items-center justify-center"
    panelStyle={{ maxHeight: '80vh' }} panelClassName="bg-ds-elevated text-ds-primary rounded-lg p-6 max-w-xl w-full overflow-auto">
    <h2 id="camera-dataset-selection-title" className="text-lg mb-4">{choices[0]?.purpose === 'photos' ? 'Choose source photos' : 'Choose a camera dataset'}</h2>
    <div className="flex flex-col gap-2">{choices.map((choice, index) => <button key={`${choice.path}:${choice.component ?? index}`}
      className="text-left rounded border border-ds p-3 hover-ds-hover" onClick={() => finish.current?.(choice)}>{choice.label}</button>)}</div>
    <button className="mt-4 underline" onClick={() => finish.current?.(null)}>Cancel</button>
  </ModalDialogShell>;
}
