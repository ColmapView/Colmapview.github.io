import { useId, useRef } from 'react';
import { modalStyles } from '../../theme';
import { CloseIcon } from '../../icons';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH } from '../../hooks/urlLoaderPolicy';
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice';
import {
  getSplatPickerDescription,
  getSplatPickerItems,
  getSplatPickerOverlayStyle,
  getSplatPickerPanelStyle,
  SPLAT_PICKER_NONE_ROW_CLASS,
  SPLAT_PICKER_ROW_CLASS,
  SPLAT_PICKER_SIZE_CLASS,
  SPLAT_PICKER_WARNING_CLASS,
} from './splatPickerViewModel';
import { useSplatPickerStoreFacade } from './useSplatPickerStoreFacade';

/**
 * Popup shown when a remote dataset resolves splats that were not auto-loaded:
 * several candidates, or a lone splat above the auto-load size budget. The user
 * picks which one to display (fetched on demand) or stays on the COLMAP scene.
 * Appears as the load finishes; switching later is still available in the Point
 * Cloud panel.
 *
 * Uses the standard popup-window header (filled title bar + close button), matching
 * FloatingWindowShell / the other popup windows, inside a centered ModalDialogShell
 * (focus trap, Escape, backdrop). Closing the window keeps the COLMAP scene.
 */
export function SplatPickerModal() {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { showSplatPicker, splatFileSources, setShowSplatPicker, selectSplatSource } =
    useSplatPickerStoreFacade();
  // Key the hint on the hardware touch signal (what the auto-load budget uses), not the
  // UI touchMode flag: a phone-width desktop window is touchMode=true but keeps the
  // 150MB desktop budget, so a touchMode-keyed hint would warn against the wrong budget.
  const isTouchDevice = useIsTouchDevice();

  const isOpen = showSplatPicker && splatFileSources.length >= 1;
  const items = getSplatPickerItems(splatFileSources, {
    warnAboveBytes: isTouchDevice ? SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH : null,
  });

  const handleClose = () => setShowSplatPicker(false);
  const handleSelect = (sourceId: string) => {
    setShowSplatPicker(false);
    selectSplatSource(sourceId);
  };

  return (
    <ModalDialogShell
      isOpen={isOpen}
      onClose={handleClose}
      ariaLabelledBy={titleId}
      ariaDescribedBy={descriptionId}
      overlayClassName="fixed inset-0 flex items-center justify-center bg-ds-void/50"
      overlayStyle={getSplatPickerOverlayStyle()}
      panelClassName="bg-ds-tertiary rounded-lg shadow-ds-lg flex flex-col w-80 overflow-hidden"
      panelStyle={getSplatPickerPanelStyle()}
      panelTestId="splat-picker-modal"
      initialFocusRef={closeButtonRef}
    >
      <div className="flex items-center justify-between px-4 py-2 rounded-t-lg bg-ds-secondary select-none">
        <span id={titleId} className={modalStyles.toolHeaderTitle}>
          Select a splat to display
        </span>
        <button
          ref={closeButtonRef}
          onClick={handleClose}
          className={modalStyles.toolHeaderClose}
          title="Skip (COLMAP only)"
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <p id={descriptionId} className="px-4 pt-3 pb-1 text-ds-muted text-sm">
        {getSplatPickerDescription(splatFileSources.length)}
      </p>
      <div className="flex flex-col gap-1 px-4 pb-3 overflow-y-auto min-h-0 flex-1">
        <button onClick={handleClose} className={SPLAT_PICKER_NONE_ROW_CLASS}>
          None - COLMAP only
        </button>
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => handleSelect(item.id)}
            className={SPLAT_PICKER_ROW_CLASS}
          >
            <span className="truncate">{item.name}</span>
            {item.sizeLabel && <span className={SPLAT_PICKER_SIZE_CLASS}>{item.sizeLabel}</span>}
            {item.warning && <span className={SPLAT_PICKER_WARNING_CLASS}>{item.warning}</span>}
          </button>
        ))}
      </div>
    </ModalDialogShell>
  );
}
