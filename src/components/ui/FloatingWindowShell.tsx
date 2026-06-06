import type {
  CSSProperties,
  MouseEventHandler,
  PointerEventHandler,
  ReactNode,
  Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { modalStyles } from '../../theme';
import { CloseIcon } from '../../icons';

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
  headerClassName?: string;
  headerStyle?: CSSProperties;
  closeTitle?: string;
  onPanelPointerDown?: PointerEventHandler<HTMLDivElement>;
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
  headerClassName = modalStyles.toolHeader,
  headerStyle,
  closeTitle = 'Close',
  onPanelPointerDown,
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
        ref={panelRef}
        data-idle-pause="true"
        data-testid={panelTestId}
        className={panelClassName}
        style={panelStyle}
        onPointerDown={onPanelPointerDown}
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
          <span className={modalStyles.toolHeaderTitle}>{title}</span>
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
