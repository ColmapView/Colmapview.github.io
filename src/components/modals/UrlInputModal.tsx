import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { inputStyles, getButtonClass } from '../../theme';
import { ChevronDownIcon, ChevronRightIcon } from '../../icons';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import {
  getUrlInputHelpItemClassName,
  getUrlInputHelpItemKey,
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
  URL_INPUT_HELP_SECTIONS,
  URL_INPUT_PLACEHOLDER,
  URL_INPUT_WARNING_TEXT_CLASS,
  type UrlInputHelpIconKind,
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
    if (!submitUrl) return;
    onLoad(submitUrl);
  }, [url, loading, onLoad]);

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
      overlayClassName="fixed inset-0 flex items-center justify-center bg-ds-void/50"
      overlayStyle={getUrlInputModalOverlayStyle()}
      panelClassName="bg-ds-tertiary border border-ds rounded-lg shadow-ds-lg p-5 min-w-[400px] max-w-[520px]"
      panelTestId="url-modal"
      initialFocusRef={inputRef}
      closeOnBackdrop={shouldCloseUrlInputFromBackdrop(true, loading)}
      closeOnEscape={!loading}
    >
        <h3 id={titleId} className="text-ds-primary font-medium mb-3">Load from URL</h3>
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

        {/* Expandable help section */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1 text-ds-muted text-xs hover:text-ds-primary transition-colors"
          >
            <UrlInputHelpIcon iconKind={helpIconKind} />
            Supported URL formats
          </button>
          {showHelp && (
            <div className="mt-2 p-3 bg-ds-secondary rounded border border-ds text-xs text-ds-muted">
              {URL_INPUT_HELP_SECTIONS.map((section) => (
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
          <button
            type="button"
            onClick={handleLoad}
            disabled={actionState.loadDisabled}
            className={getButtonClass('primary', 'lg', actionState.loadDisabled)}
          >
            {actionState.loadLabel}
          </button>
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
  section: (typeof URL_INPUT_HELP_SECTIONS)[number];
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
