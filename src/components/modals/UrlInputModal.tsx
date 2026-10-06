import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { inputStyles, getButtonClass, modalStyles, floatingPanelStyles, panelStyles } from '../../theme';
import { ChevronDownIcon, ChevronRightIcon, CloseIcon } from '../../icons';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { isGoogleDriveEnabled } from '../../features/googleDrive/config';
import {
  getUrlInputHelpItemClassName,
  getUrlInputHelpItemKey,
  getUrlInputDriveHandoffUrl,
  getUrlInputHelpSections,
  getUrlInputActionState,
  getUrlInputHelpIconKind,
  getUrlInputHelpSectionTitleClassName,
  getUrlInputModalOverlayStyle,
  getUrlInputSubmitUrl,
  getUrlInputWarningHelpText,
  isUrlInputWarningHelpSection,
  shouldCloseUrlInputFromBackdrop,
  shouldSubmitUrlInputKey,
  URL_INPUT_DESCRIPTION,
  URL_INPUT_HELP_CODE_CLASS,
  URL_INPUT_HELP_LIST_CLASS,
  URL_INPUT_PLACEHOLDER,
  URL_INPUT_WARNING_TEXT_CLASS,
  type UrlInputHelpIconKind,
  type UrlInputHelpSection as UrlHelpSection,
} from './urlInputModalViewModel';

interface UrlInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (url: string) => void;
  loading?: boolean;
}

/**
 * Simple popup modal for entering a URL to load a COLMAP reconstruction.
 * - Centered on screen with backdrop
 * - URL input field with placeholder
 * - Load and Cancel buttons
 * - Enter key to submit, Escape to close
 */
export function UrlInputModal({ isOpen, onClose, onLoad, loading = false }: UrlInputModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [url, setUrl] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const googleDriveEnabled = Boolean(isGoogleDriveEnabled());
  const driveHandoffUrl = getUrlInputDriveHandoffUrl(url, googleDriveEnabled);
  const helpSections = getUrlInputHelpSections(googleDriveEnabled);
  const actionState = getUrlInputActionState(url, loading);
  const helpIconKind = getUrlInputHelpIconKind(showHelp);

  // Clear URL when modal closes
  useEffect(() => {
    if (!isOpen) {
      const timeout = setTimeout(() => setUrl(''), 0);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  // Handle load action
  const handleLoad = useCallback(() => {
    const submitUrl = getUrlInputSubmitUrl(url, loading);
    if (!submitUrl || getUrlInputDriveHandoffUrl(submitUrl, googleDriveEnabled)) return;
    onLoad(submitUrl);
  }, [url, loading, onLoad, googleDriveEnabled]);

  // Handle key events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (shouldSubmitUrlInputKey(e.key, loading)) {
      handleLoad();
    }
  }, [handleLoad, loading]);

  return (
    <ModalDialogShell
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy={titleId}
      ariaDescribedBy={descriptionId}
      overlayClassName={panelStyles.overlay}
      overlayStyle={getUrlInputModalOverlayStyle()}
      panelClassName={`${floatingPanelStyles.dialog} url-input-panel`}
      panelTestId="url-modal"
      initialFocusRef={inputRef}
      closeOnBackdrop={shouldCloseUrlInputFromBackdrop(true, loading)}
      closeOnEscape={!loading}
    >
      <div className={`${modalStyles.popupHeader} flex-shrink-0`}>
        <h3 id={titleId} className={modalStyles.toolHeaderTitle}>Load from URL</h3>
        <button type="button" onClick={onClose} disabled={loading} className={modalStyles.toolHeaderClose} aria-label="Close URL dialog">
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className={panelStyles.scrollBody}>
        <p id={descriptionId} className="text-ds-muted text-sm mb-4">
          {URL_INPUT_DESCRIPTION}
        </p>

        {/* URL input */}
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={URL_INPUT_PLACEHOLDER}
          className={`${inputStyles.base} ${inputStyles.sizes.lg} w-full mb-4 text-sm placeholder-ds-muted`}
          disabled={loading}
        />
        {driveHandoffUrl && <p className="text-ds-muted text-sm mb-4">
          Open this archive on colmapview.opsiclear.com to use Google Drive.
        </p>}

        {/* Expandable help section */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1 text-ds-muted text-xs hover-ds-text-primary transition-colors"
          >
            <UrlInputHelpIcon iconKind={helpIconKind} />
            Supported URL formats
          </button>
          {showHelp && (
            <div className="mt-2 p-3 bg-ds-tertiary rounded border border-ds text-xs text-ds-muted">
              {helpSections.map((section) => (
                <UrlInputHelpSection key={section.title} section={section} />
              ))}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={actionState.cancelDisabled}
            className={getButtonClass('ghost', 'lg', actionState.cancelDisabled)}
          >
            Cancel
          </button>
          {driveHandoffUrl && !loading ? <a href={driveHandoffUrl} className={getButtonClass('primary', 'lg')}>
            Use Google Drive
          </a> : <button
            type="button"
            onClick={handleLoad}
            disabled={actionState.loadDisabled}
            className={getButtonClass('primary', 'lg', actionState.loadDisabled)}
          >
            {actionState.loadLabel}
          </button>}
        </div>
      </div>
    </ModalDialogShell>
  );
}

function UrlInputHelpIcon({ iconKind }: { iconKind: UrlInputHelpIconKind }) {
  if (iconKind === 'open') {
    return <ChevronDownIcon className="w-3 h-3" />;
  }

  return <ChevronRightIcon className="w-3 h-3" />;
}

function UrlInputHelpSection({
  section,
}: {
  section: UrlHelpSection;
}) {
  const titleClass = getUrlInputHelpSectionTitleClassName(section);

  if (isUrlInputWarningHelpSection(section)) {
    return (
      <>
        <div className={titleClass}>{section.title}</div>
        <p className={URL_INPUT_WARNING_TEXT_CLASS}>{getUrlInputWarningHelpText(section)}</p>
      </>
    );
  }

  return (
    <>
      <div className={titleClass}>{section.title}</div>
      <ul className={URL_INPUT_HELP_LIST_CLASS}>
        {section.items.map((item) => (
          <li
            key={getUrlInputHelpItemKey(item)}
            className={getUrlInputHelpItemClassName(item)}
          >
            {item.text && <>{item.text}{item.code ? ' ' : ''}</>}
            {item.code && <code className={URL_INPUT_HELP_CODE_CLASS}>{item.code}</code>}
            {item.suffix}
          </li>
        ))}
      </ul>
    </>
  );
}
