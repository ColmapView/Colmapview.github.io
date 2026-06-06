/**
 * Reusable UI components for the 3D viewer controls.
 * Extracted from ViewerControls.tsx for better organization.
 */

import { useState, useEffect, memo, useRef, useCallback, type ReactNode } from 'react';
import { controlPanelStyles, getControlButtonClass, getTooltipProps } from '../../theme';
import { isEventTargetOutside } from '../../utils/domTargetGuards';
import {
  getControlPanelAdjustedTop,
  getControlPanelWrapperStyle,
  getControlButtonAccessibleLabel,
  getControlButtonTouchAction,
  hasControlPanelHeightChangedSignificantly,
  hasControlButtonPanel,
  shouldListenForOutsideTouch,
  shouldShowControlButtonPanel,
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

// Panel type for control buttons
export type PanelType = 'view' | 'points' | 'scale' | 'matches' | 'selectionColor' | 'axes' | 'bg' | 'camera' | 'prefetch' | 'frustumColor' | 'screenshot' | 'share' | 'export' | 'transform' | 'gallery' | 'rig' | 'settings' | null;

export interface PanelWrapperProps {
  title: string;
  children: ReactNode;
}

export const PanelWrapper = memo(function PanelWrapper({ title, children }: PanelWrapperProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [adjustedTop, setAdjustedTop] = useState<number | null>(null);
  const lastHeightRef = useRef<number>(0);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    let animationFrame: number | null = null;
    const measure = (heightHint?: number, force = false) => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }

      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        const rect = panel.getBoundingClientRect();
        const height = heightHint ?? rect.height;
        if (!force && !hasControlPanelHeightChangedSignificantly(height, lastHeightRef.current)) {
          return;
        }

        lastHeightRef.current = height;
        setAdjustedTop(getControlPanelAdjustedTop(rect, window.innerHeight));
      });
    };

    measure(undefined, true);

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => {
        measure(entries[0]?.contentRect.height);
      });
    resizeObserver?.observe(panel);

    const handleWindowResize = () => measure(undefined, true);
    window.addEventListener('resize', handleWindowResize);

    return () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

  return (
    <div
      ref={panelRef}
      className={styles.panelWrapper}
      style={getControlPanelWrapperStyle(adjustedTop)}
    >
      <div className={styles.panel}>
        <div className={styles.panelTitle}>{title}</div>
        {children}
      </div>
    </div>
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
  const hasPanel = hasControlButtonPanel(panelTitle, children);
  const {
    touchMode,
    contextMenuOpen,
  } = useControlButtonStoreFacade();
  const isHovered = activePanel === panelId && !contextMenuOpen;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contextMenuOpen && activePanel === panelId) {
      setActivePanel(null);
    }
  }, [activePanel, contextMenuOpen, panelId, setActivePanel]);

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
      if (isEventTargetOutside(containerRef.current, e.target)) {
        setActivePanel(null);
      }
    };

    document.addEventListener('touchstart', handleOutsideTouch, { passive: true });
    return () => document.removeEventListener('touchstart', handleOutsideTouch);
  }, [contextMenuOpen, touchMode, isHovered, hasPanel, setActivePanel]);

  const accessibleLabel = getControlButtonAccessibleLabel(tooltip, disabled);

  return (
    <div
      ref={containerRef}
      className="relative w-10 control-button-responsive"
      onMouseEnter={touchMode ? undefined : () => !disabled && !contextMenuOpen && setActivePanel(panelId)}
      onMouseLeave={touchMode ? undefined : () => setActivePanel(null)}
    >
      <button
        onClick={disabled ? undefined : (touchMode ? handleTouchClick : onClick)}
        onDoubleClick={disabled ? undefined : onDoubleClick}
        disabled={disabled}
        aria-label={accessibleLabel}
        className={`group ${getControlButtonClass(isActive, isHovered)} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
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
        <PanelWrapper title={panelTitle!}>
          {children}
        </PanelWrapper>
      )}
    </div>
  );
});
