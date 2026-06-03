import {
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { getModalDialogFocusableElements } from './modalDialogShellPolicy';

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
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    }

    const focusable = getModalDialogFocusableElements(dialogRef.current);
    const initialFocusTarget = initialFocusRef?.current ?? focusable[0] ?? dialogRef.current;
    initialFocusTarget?.focus();

    return () => {
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, [isOpen, initialFocusRef]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
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

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

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
