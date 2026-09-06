import { useId, useLayoutEffect, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { hoverCardStyles, ICON_SIZES } from '../../theme';
import { MouseLeftIcon, MouseRightIcon, MouseScrollIcon } from '../../icons';
import {
  getMouseTooltipStyle,
  getClampedTooltipPosition,
  getMouseTooltipTarget,
  parseMouseTooltipContent,
  shouldClearMouseTooltipOnMouseOut,
  shouldUpdateMouseTooltipTarget,
} from './mouseTooltipPolicy';
import type { MouseTooltipIconMarker } from './mouseTooltipPolicy';
import { useMouseTooltipStoreFacade } from './useMouseTooltipStoreFacade';

function renderMouseTooltipIcon(marker: MouseTooltipIconMarker, key: string): ReactNode {
  const className = `${ICON_SIZES.hoverCard} inline-block align-text-bottom`;

  if (marker === 'LMB') {
    return <MouseLeftIcon key={key} className={className} />;
  }

  if (marker === 'RMB') {
    return <MouseRightIcon key={key} className={className} />;
  }

  return <MouseScrollIcon key={key} className={className} />;
}

function renderMouseTooltipContent(text: string): ReactNode[] {
  return parseMouseTooltipContent(text).map((part) => {
    if (part.type === 'text') {
      return part.text;
    }

    return renderMouseTooltipIcon(part.marker, part.key);
  });
}

/**
 * Global mouse-following tooltip that displays content from data-tooltip attributes.
 * Replaces CSS-only tooltips with a dynamic mouse-tracking version.
 *
 * Supports inline mouse icons using markers:
 * - {LMB} - Left mouse button icon
 * - {RMB} - Right mouse button icon
 * - {SCROLL} - Mouse scroll wheel icon
 */
export function MouseTooltip() {
  const tooltipId = useId();
  const popupRef = useRef<HTMLDivElement>(null);
  const dismissedTarget = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const [focusHint, setFocusHint] = useState<{ text: string; x: number; y: number } | null>(null);
  const { touchMode } = useMouseTooltipStoreFacade();
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const currentElementRef = useRef<HTMLElement | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });

    const nextTarget = getMouseTooltipTarget(e.target);

    if (nextTarget?.element === dismissedTarget.current) return;
    dismissedTarget.current = null;
    if (nextTarget) {
      if (shouldUpdateMouseTooltipTarget({
        next: nextTarget,
        currentElement: currentElementRef.current,
        currentText: tooltip,
      })) {
        currentElementRef.current = nextTarget.element;
        setTooltip(nextTarget.text);
      }
    } else if (currentElementRef.current) {
      dismissedTarget.current = null;
      currentElementRef.current = null;
      setTooltip(null);
    }
  }, [tooltip]);

  const handleMouseOver = useCallback((e: MouseEvent) => {
    const nextTarget = getMouseTooltipTarget(e.target);
    if (nextTarget?.element === dismissedTarget.current) return;
    dismissedTarget.current = null;
    if (nextTarget) {
      currentElementRef.current = nextTarget.element;
      setTooltip(nextTarget.text);
    }
  }, []);

  const handleMouseOut = useCallback((e: MouseEvent) => {
    if (shouldClearMouseTooltipOnMouseOut(e.relatedTarget)) {
      dismissedTarget.current = null;
      currentElementRef.current = null;
      setTooltip(null);
    }
  }, []);

  useEffect(() => {
    if (touchMode) return;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
    };
  }, [touchMode, handleMouseMove, handleMouseOver, handleMouseOut]);

  useEffect(() => {
    let describedElement: HTMLElement | null = null;
    const clear = () => {
      if (describedElement) {
        const ids = (describedElement.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== tooltipId);
        if (ids.length) describedElement.setAttribute('aria-describedby', ids.join(' '));
        else describedElement.removeAttribute('aria-describedby');
        describedElement = null;
      }
      setFocusHint(null);
    };
    const focus = (event: FocusEvent) => {
      clear();
      dismissedTarget.current = null;
      const target = getMouseTooltipTarget(event.target);
      if (!target?.text || !target.element.matches(':focus-visible')) return;
      describedElement = target.element;
      const ids = describedElement.getAttribute('aria-describedby');
      describedElement.setAttribute('aria-describedby', [ids, tooltipId].filter(Boolean).join(' '));
      const rect = target.element.getBoundingClientRect();
      setFocusHint({ text: target.text, x: rect.left, y: rect.top });
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissedTarget.current = currentElementRef.current;
        clear();
        setTooltip(null);
      }
    };
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', clear);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', clear);
    document.addEventListener('scroll', clear, true);
    return () => {
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', clear);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', clear);
      document.removeEventListener('scroll', clear, true);
      clear();
    };
  }, [tooltipId]);

  const visibleText = focusHint?.text ?? (touchMode ? null : tooltip);
  useLayoutEffect(() => {
    if (!visibleText || !popupRef.current) return;
    const rect = popupRef.current.getBoundingClientRect();
    setPosition(getClampedTooltipPosition(focusHint ?? mousePos, rect,
      { width: window.innerWidth, height: window.innerHeight }, Boolean(focusHint)));
  }, [visibleText, focusHint, mousePos]);
  if (!visibleText) return null;


  return (
    <div
      ref={popupRef}
      id={tooltipId}
      role="tooltip"
      className="fixed pointer-events-none"
      style={{ ...getMouseTooltipStyle(mousePos), right: undefined, ...position, maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100dvh - 16px)', overflow: 'hidden' }}
    >
      <div className={`${hoverCardStyles.container} text-xs px-2 py-1 whitespace-pre-line max-w-xs`}>
        {renderMouseTooltipContent(visibleText)}
      </div>
    </div>
  );
}
