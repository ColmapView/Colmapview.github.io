import {
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { getModalDialogFocusableElements, openModalDialog } from './modalDialogShellPolicy';
import { useFloatingDialogFocus } from './useFloatingDialogFocus';

interface ModalDialogShellProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  overlayClassName: string;
  overlayStyle?: CSSProperties;
  panelClassName: string;
  panelStyle?: CSSProperties;
  panelTestId?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  renderBackdrop?: boolean;
  backdropClassName?: string;
}

export function ModalDialogShell({
  isOpen,
  onClose,
  children,
  ariaLabelledBy,
  ariaDescribedBy,
  overlayClassName,
  overlayStyle,
  panelClassName,
  panelStyle,
  panelTestId,
  initialFocusRef,
  closeOnBackdrop = true,
  closeOnEscape = true,
  renderBackdrop = false,
  backdropClassName,
}: ModalDialogShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);

  useFloatingDialogFocus(isOpen, dialogRef, initialFocusRef);

  useEffect(() => {
    keyHandlerRef.current = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (closeOnEscape) {
          event.preventDefault();
          onClose();
        }
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getModalDialogFocusableElements(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
  }, [closeOnEscape, onClose]);

  // Opened on top of any open dialog, it keeps that place while its handlers change.
  useEffect(() => (isOpen ? openModalDialog(event => keyHandlerRef.current(event)) : undefined), [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      onClose();
    }
  };

  const dialog = (
    <div
      className={overlayClassName}
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      onClick={handleBackdropClick}
    >
      {renderBackdrop && (
        <div
          className={backdropClassName}
          onClick={(event) => {
            if (closeOnBackdrop && event.target === event.currentTarget) {
              onClose();
            }
          }}
        />
      )}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={panelClassName}
        style={panelStyle}
        data-testid={panelTestId}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
