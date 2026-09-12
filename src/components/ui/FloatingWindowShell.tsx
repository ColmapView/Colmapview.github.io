import {
  useCallback,
  useId,
  useRef,
  type CSSProperties,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { modalStyles } from '../../theme';
import { CloseIcon } from '../../icons';
import { useFloatingDialogFocus } from './useFloatingDialogFocus';

/**
 * Publish an authored `width` as `--tool-modal-width` *instead of* an inline
 * `width`, and let the stylesheet turn the property back into a width
 * (index.css: `.tool-modal-responsive { width: var(--tool-modal-width) }`, then
 * `* 0.85` inside `@media (max-width: 1520px)`).
 *
 * Tool windows own their width in JS — the same number clamps the drag position
 * against the viewport — so it arrives as an inline declaration, which no
 * stylesheet can beat. Handing the number over as a custom property lets the
 * compact tier do arithmetic on it without `!important`, and keeps the two
 * declarations from fighting: exactly one of them (the stylesheet's) ever sets
 * `width`, so a rule that fails to resolve can only lose the cascade, never win
 * it and then collapse the box to shrink-to-fit.
 *
 * Windows that size to their content author no width and publish no property;
 * `var()` on an undefined custom property is invalid at computed-value time, so
 * `width` computes to its initial value `auto` — what those windows already had.
 *
 * The swap is gated on the panel actually carrying `tool-modal-responsive`: the
 * property is inert without that rule, so a caller with its own panel class
 * keeps its inline width rather than losing it to a hook that isn't there.
 */
function withCompactWidthVar(
  style: CSSProperties | undefined,
  panelClassName: string
): CSSProperties | undefined {
  if (style?.width === undefined) return style;
  if (!panelClassName.split(/\s+/).includes('tool-modal-responsive')) return style;
  const { width, ...rest } = style;
  return {
    ...rest,
    '--tool-modal-width': typeof width === 'number' ? `${width}px` : width,
  } as CSSProperties;
}

// Module scope on purpose: react-hooks/immutability forbids writing to a prop's
// `.current` inside the component body.
function assignForwardedRef(ref: Ref<HTMLDivElement> | undefined, node: HTMLDivElement | null): void {
  if (typeof ref === 'function') {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}

interface FloatingWindowShellProps {
  isOpen: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  panelRef?: Ref<HTMLDivElement>;
  overlayClassName?: string;
  overlayStyle?: CSSProperties;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  panelTestId?: string;
  panelId?: string;
  headerClassName?: string;
  headerStyle?: CSSProperties;
  closeTitle?: string;
  onPanelPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPanelKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onHeaderPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPanelMouseDown?: MouseEventHandler<HTMLDivElement>;
  onHeaderMouseDown?: MouseEventHandler<HTMLDivElement>;
  onPanelContextMenu?: MouseEventHandler<HTMLDivElement>;
  onHeaderContextMenu?: MouseEventHandler<HTMLDivElement>;
  renderBackdrop?: boolean;
  backdropClassName?: string;
  onBackdropClick?: () => void;
  renderCloseIcon?: ReactNode;
  portal?: boolean;
}

export function FloatingWindowShell({
  isOpen,
  title,
  onClose,
  children,
  panelRef,
  overlayClassName = 'fixed inset-0 pointer-events-none',
  overlayStyle,
  panelClassName = modalStyles.toolPanel,
  panelStyle,
  panelTestId,
  panelId,
  headerClassName = modalStyles.toolHeader,
  headerStyle,
  closeTitle = 'Close',
  onPanelPointerDown,
  onPanelKeyDown,
  onHeaderPointerDown,
  onPanelMouseDown,
  onHeaderMouseDown,
  onPanelContextMenu,
  onHeaderContextMenu,
  renderBackdrop = false,
  backdropClassName = modalStyles.backdrop,
  onBackdropClick,
  renderCloseIcon,
  portal = false,
}: FloatingWindowShellProps) {
  const titleId = useId();
  const internalPanelRef = useRef<HTMLDivElement | null>(null);
  // The node has to reach both refs: the internal one drives focus management,
  // the forwarded one drives caller-owned behavior (drag bounds, outside-click
  // checks). Memoized on panelRef so a re-render does not detach/re-attach
  // (null, then node) the caller-supplied ref, which a plain object ref never
  // did before.
  const setPanelRef = useCallback((node: HTMLDivElement | null) => {
    internalPanelRef.current = node;
    assignForwardedRef(panelRef, node);
  }, [panelRef]);
  useFloatingDialogFocus(isOpen, internalPanelRef);

  if (!isOpen) return null;

  const shell = (
    <div className={overlayClassName} style={overlayStyle}>
      {renderBackdrop && (
        <div
          className={backdropClassName}
          onClick={onBackdropClick}
        />
      )}
      <div
        ref={setPanelRef}
        id={panelId}
        role="dialog"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-idle-pause="true"
        data-testid={panelTestId}
        className={panelClassName}
        style={withCompactWidthVar(panelStyle, panelClassName)}
        onPointerDown={onPanelPointerDown}
        onKeyDown={onPanelKeyDown}
        onMouseDown={onPanelMouseDown}
        onContextMenu={onPanelContextMenu}
      >
        <div
          className={headerClassName}
          style={headerStyle}
          onPointerDown={onHeaderPointerDown}
          onMouseDown={onHeaderMouseDown}
          onContextMenu={onHeaderContextMenu}
        >
          <span id={titleId} className={modalStyles.toolHeaderTitle}>{title}</span>
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            className={modalStyles.toolHeaderClose}
            title={closeTitle}
          >
            {renderCloseIcon ?? <CloseIcon className="w-3.5 h-3.5" />}
          </button>
        </div>
        {children}
      </div>
    </div>
  );

  return portal ? createPortal(shell, document.body) : shell;
}
