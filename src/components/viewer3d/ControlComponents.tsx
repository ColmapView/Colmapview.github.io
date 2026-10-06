/**
 * Reusable UI components for the 3D viewer controls.
 * Extracted from ViewerControls.tsx for better organization.
 */

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { buttonStyles, controlPanelStyles, getControlButtonClass, getTooltipProps } from '../../theme';
import { isEventTargetOutside } from '../../utils/domTargetGuards';
import {
  CONTROL_PANEL_STATUS_BAR_CLEARANCE,
  CONTROL_PANEL_VIEWPORT_MARGIN,
  getControlPanelPosition,
  getControlButtonAccessibleLabel,
  getControlButtonTouchAction,
  hasControlButtonPanel,
  shouldListenForOutsideTouch,
  shouldShowControlButtonPanel,
  type ControlPanelPosition,
} from './controlButtonPolicy';
import { useControlButtonStoreFacade } from './useControlButtonStoreFacade';
export { SelectRow, ToggleRow } from './controlRows/BasicRows';
export type { SelectRowProps, ToggleRowProps } from './controlRows/BasicRows';
export { ColorPickerRow, HueRow, HueSliderRow } from './controlRows/ColorRows';
export type { ColorPickerRowProps, HueRowProps, HueSliderRowProps } from './controlRows/ColorRows';
export { MouseScrollIcon, SliderRow } from './controlRows/SliderRow';
export type { SliderRowProps } from './controlRows/SliderRow';

// Use centralized styles from theme
const styles = controlPanelStyles;
const FOCUSABLE_CONTROL_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableControls(parent: ParentNode): HTMLElement[] {
  return [...parent.querySelectorAll<HTMLElement>(FOCUSABLE_CONTROL_SELECTOR)].filter(element => {
    const style = getComputedStyle(element);
    return element.tabIndex >= 0
      && !element.closest('[hidden], [aria-hidden="true"]')
      && style.display !== 'none'
      && style.visibility !== 'hidden';
  });
}

// Panel type for control buttons
export type PanelType = 'view' | 'points' | 'scale' | 'matches' | 'selectionColor' | 'axes' | 'bg' | 'camera' | 'prefetch' | 'frustumColor' | 'screenshot' | 'share' | 'publish' | 'publishDrive' | 'export' | 'transform' | 'align' | 'gallery' | 'rig' | 'settings' | null;

export interface PanelWrapperProps {
  id?: string;
  title: string;
  children: ReactNode;
  anchorRef: RefObject<HTMLElement | null>;
  onReady?: (panel: HTMLDivElement) => void;
}

export const PanelWrapper = memo(function PanelWrapper({ id, title, children, anchorRef, onReady }: PanelWrapperProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<ControlPanelPosition | null>(null);

  // Ancestor refs attach after child layout effects, so measure after the full commit.
  useEffect(() => {
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor) return;

    let animationFrame: number | null = null;
    const visualViewport = window.visualViewport;
    const measure = () => {
      const next = getControlPanelPosition(anchor.getBoundingClientRect(), panel.getBoundingClientRect(), {
        width: visualViewport?.width ?? window.innerWidth,
        height: visualViewport?.height ?? window.innerHeight,
        offsetLeft: visualViewport?.offsetLeft,
        offsetTop: visualViewport?.offsetTop,
      });
      setPosition(current => current?.left === next.left
        && current.top === next.top
        && current.opensRight === next.opensRight
        && current.maxWidth === next.maxWidth
        && current.maxHeight === next.maxHeight
        ? current : next);
    };
    const scheduleMeasure = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        measure();
      });
    };
    measure();

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasure);
    resizeObserver?.observe(panel);
    resizeObserver?.observe(anchor);
    // Gallery resizing moves the toolbar without changing the panel's own size.
    const scene = anchor.closest('[data-testid="scene-3d"]');
    const toolbar = anchor.closest('[data-testid="viewer-controls"]');
    if (scene) resizeObserver?.observe(scene);
    if (toolbar) resizeObserver?.observe(toolbar);
    window.addEventListener('resize', scheduleMeasure);
    visualViewport?.addEventListener('resize', scheduleMeasure);
    visualViewport?.addEventListener('scroll', scheduleMeasure);

    return () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      visualViewport?.removeEventListener('resize', scheduleMeasure);
      visualViewport?.removeEventListener('scroll', scheduleMeasure);
    };
  }, [anchorRef]);

  useEffect(() => {
    if (position && panelRef.current) onReady?.(panelRef.current);
  }, [position, onReady]);

  return createPortal(
    <div
      id={id}
      role="region"
      aria-label={title}
      data-idle-pause="true"
      ref={panelRef}
      className={styles.panelWrapper}
      style={{
        left: position?.left,
        top: position?.top,
        visibility: position ? undefined : 'hidden',
        maxWidth: position?.maxWidth ?? `calc(100vw - ${CONTROL_PANEL_VIEWPORT_MARGIN * 2}px)`,
        maxHeight: position?.maxHeight ?? `calc(100dvh - ${CONTROL_PANEL_STATUS_BAR_CLEARANCE + CONTROL_PANEL_VIEWPORT_MARGIN * 2}px)`,
        // Keep the gap inside the hover target so the pointer can cross to the popup.
        paddingLeft: position?.opensRight ? CONTROL_PANEL_VIEWPORT_MARGIN : 0,
        paddingRight: position?.opensRight ? 0 : CONTROL_PANEL_VIEWPORT_MARGIN,
      }}
    >
      <div className={styles.panel} style={{ maxWidth: '100%', maxHeight: 'inherit', overflowY: 'auto' }}>
        <div className={styles.panelTitle}>{title}</div>
        {children}
      </div>
    </div>,
    document.body
  );
});

export interface ControlButtonProps {
  panelId: PanelType;
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  icon: ReactNode;
  tooltip: string;
  isActive?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  panelTitle?: string;
  children?: ReactNode;
  disabled?: boolean;
}

export const ControlButton = memo(function ControlButton({
  panelId,
  activePanel,
  setActivePanel,
  icon,
  tooltip,
  isActive = false,
  onClick,
  onDoubleClick,
  panelTitle,
  children,
  disabled = false,
}: ControlButtonProps) {
  const contentId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoringFocus = useRef(false);
  const keyboardFocus = useRef(false);
  const pendingPanelFocus = useRef(false);
  const hasPanel = hasControlButtonPanel(panelTitle, children);
  const {
    touchMode,
    contextMenuOpen,
  } = useControlButtonStoreFacade();
  const isHovered = activePanel === panelId && !contextMenuOpen;
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePanelReady = useCallback((panel: HTMLElement) => {
    if (!pendingPanelFocus.current) return;
    pendingPanelFocus.current = false;
    getFocusableControls(panel)[0]?.focus();
  }, []);

  const focusPanel = useCallback(() => {
    pendingPanelFocus.current = true;
    const panel = document.getElementById(contentId);
    // New panels remain hidden until their measured position is committed.
    if (panel && getComputedStyle(panel).visibility !== 'hidden') handlePanelReady(panel);
  }, [contentId, handlePanelReady]);

  useEffect(() => {
    if (!isHovered) pendingPanelFocus.current = false;
    if (contextMenuOpen && activePanel === panelId) {
      setActivePanel(null);
    }
  }, [activePanel, contextMenuOpen, isHovered, panelId, setActivePanel]);

  // In touch mode: first tap shows panel, second tap executes action
  const handleTouchClick = useCallback(() => {
    const action = getControlButtonTouchAction({ disabled, hasPanel, isHovered });
    if (action === 'execute-click') {
      onClick?.();
    } else if (action === 'open-panel') {
      setActivePanel(panelId);
    }
  }, [disabled, hasPanel, isHovered, onClick, setActivePanel, panelId]);

  // Close panel when tapping outside in touch mode
  useEffect(() => {
    if (!shouldListenForOutsideTouch({
      contextMenuOpen,
      touchMode,
      isHovered,
      hasPanel,
    })) return;

    const handleOutsideTouch = (e: TouchEvent) => {
      if (isEventTargetOutside(containerRef.current, e.target) && isEventTargetOutside(document.getElementById(contentId), e.target)) {
        setActivePanel(null);
      }
    };

    document.addEventListener('touchstart', handleOutsideTouch, { passive: true });
    return () => document.removeEventListener('touchstart', handleOutsideTouch);
  }, [contextMenuOpen, touchMode, isHovered, hasPanel, setActivePanel, contentId]);

  const accessibleLabel = getControlButtonAccessibleLabel(tooltip, disabled);

  return (
    <div
      ref={containerRef}
      className="relative w-10 control-button-responsive"
      onMouseEnter={touchMode ? undefined : () => !disabled && !contextMenuOpen && setActivePanel(panelId)}
      onMouseLeave={touchMode ? undefined : () => {
        if (!keyboardFocus.current) setActivePanel(null);
      }}
      onFocus={(event) => {
        if (restoringFocus.current || !hasPanel || disabled || contextMenuOpen) return;
        if (event.target.matches(':focus-visible')) {
          keyboardFocus.current = true;
          setActivePanel(panelId);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !document.getElementById(contentId)?.contains(event.relatedTarget)) {
          keyboardFocus.current = false;
          pendingPanelFocus.current = false;
          setActivePanel(null);
        }
      }}
      onKeyDown={(event) => {
        // Popup controls own their arrow keys; gallery navigation listens on window.
        if (event.target !== triggerRef.current && event.key.startsWith('Arrow')) event.stopPropagation();
        if (event.key === 'Escape' && isHovered) {
          event.stopPropagation();
          pendingPanelFocus.current = false;
          restoringFocus.current = true;
          triggerRef.current?.focus();
          restoringFocus.current = false;
          keyboardFocus.current = false;
          setActivePanel(null);
        } else if (event.key === 'ArrowDown' && event.target === triggerRef.current && hasPanel && !disabled && !contextMenuOpen) {
          event.preventDefault();
          event.stopPropagation();
          keyboardFocus.current = true;
          setActivePanel(panelId);
          focusPanel();
        } else if (event.key === 'Tab' && isHovered && hasPanel) {
          const panel = document.getElementById(contentId);
          if (!panel) return;
          const controls = getFocusableControls(panel);
          if (event.target === triggerRef.current && !event.shiftKey && controls.length > 0) {
            event.preventDefault();
            keyboardFocus.current = true;
            focusPanel();
          } else if (event.target === controls[0] && event.shiftKey) {
            event.preventDefault();
            triggerRef.current?.focus();
          } else if (event.target === controls[controls.length - 1] && !event.shiftKey) {
            // A portal sits at the end of the document; resume the trigger's tab order.
            const outsideControls = getFocusableControls(document).filter(element => !panel.contains(element));
            const next = outsideControls[outsideControls.indexOf(triggerRef.current!) + 1];
            setActivePanel(null);
            if (next) {
              event.preventDefault();
              next.focus();
            }
          }
        }
      }}
    >
      <button
        ref={triggerRef}
        aria-expanded={hasPanel ? isHovered && !disabled : undefined}
        aria-controls={hasPanel ? contentId : undefined}
        onClick={disabled ? undefined : (touchMode ? handleTouchClick : onClick)}
        onDoubleClick={disabled ? undefined : onDoubleClick}
        disabled={disabled}
        aria-label={accessibleLabel}
        className={`group ${getControlButtonClass(isActive, isHovered)} ${disabled ? buttonStyles.disabled : ''}`}
        {...(!hasPanel && getTooltipProps(accessibleLabel, 'left'))}
      >
        {icon}
      </button>
      {shouldShowControlButtonPanel({
        contextMenuOpen,
        hasPanel,
        isHovered,
        disabled,
      }) && (
        <PanelWrapper id={contentId} title={panelTitle!} anchorRef={containerRef} onReady={handlePanelReady}>
          {children}
        </PanelWrapper>
      )}
    </div>
  );
});
