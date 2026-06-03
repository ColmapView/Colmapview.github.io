import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getButtonClass } from '../../theme';
import {
  registerConfirmationHandler,
  type ConfirmationRequest,
} from '../../utils/confirmation';
import {
  getConfirmationDialogClass,
  getConfirmationDialogStyle,
  getConfirmationOverlayStyle,
} from './confirmationHostPolicy';

interface PendingConfirmation {
  request: ConfirmationRequest;
  resolve: (confirmed: boolean) => void;
}

export function ConfirmationHost() {
  const titleId = useId();
  const messageId = useId();
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const pendingRef = useRef<PendingConfirmation | null>(null);
  const queueRef = useRef<PendingConfirmation[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const restoreFocus = useCallback(() => {
    const previousFocus = previousFocusRef.current;
    previousFocusRef.current = null;
    if (previousFocus?.isConnected) {
      previousFocus.focus();
    }
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    if (!current) return;

    current.resolve(confirmed);
    const next = queueRef.current.shift() ?? null;
    pendingRef.current = next;
    setPending(next);
    if (!next) {
      restoreFocus();
    }
  }, [restoreFocus]);

  const showConfirmation = useCallback((request: ConfirmationRequest) => (
    new Promise<boolean>((resolve) => {
      const next = { request, resolve };
      if (pendingRef.current) {
        queueRef.current.push(next);
        return;
      }

      pendingRef.current = next;
      setPending(next);
    })
  ), []);

  useEffect(() => {
    registerConfirmationHandler(showConfirmation);

    return () => {
      registerConfirmationHandler(null);
      pendingRef.current?.resolve(false);
      for (const queued of queueRef.current) {
        queued.resolve(false);
      }
      pendingRef.current = null;
      queueRef.current = [];
      restoreFocus();
    };
  }, [showConfirmation, restoreFocus]);

  useEffect(() => {
    if (!pending) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        settle(false);
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []
      );
      if (focusable.length === 0) return;

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
  }, [pending, settle]);

  useEffect(() => {
    if (!pending) return;
    if (!previousFocusRef.current && document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    }
    cancelButtonRef.current?.focus();
  }, [pending]);

  if (!pending) return null;

  const { request } = pending;
  const confirmVariant = request.tone === 'danger' ? 'danger' : 'primary';

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-ds-void/60 px-4"
      style={getConfirmationOverlayStyle()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          settle(false);
        }
      }}
    >
      <div
        ref={dialogRef}
        className={getConfirmationDialogClass(request.size)}
        style={getConfirmationDialogStyle(request.size)}
      >
        <h3 id={titleId} className="text-ds-primary text-base font-medium mb-2">
          {request.title}
        </h3>
        <p id={messageId} className="text-ds-secondary text-sm whitespace-pre-line mb-5">
          {request.message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            className={getButtonClass('ghost', 'lg')}
            onClick={() => settle(false)}
          >
            {request.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className={getButtonClass(confirmVariant, 'lg')}
            onClick={() => settle(true)}
          >
            {request.confirmLabel ?? 'Continue'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
