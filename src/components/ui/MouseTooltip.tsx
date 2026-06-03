import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { hoverCardStyles, ICON_SIZES } from '../../theme';
import { MouseLeftIcon, MouseRightIcon, MouseScrollIcon } from '../../icons';
import {
  getMouseTooltipStyle,
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
  const { touchMode } = useMouseTooltipStoreFacade();
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const currentElementRef = useRef<HTMLElement | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });

    const nextTarget = getMouseTooltipTarget(e.target);

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
      currentElementRef.current = null;
      setTooltip(null);
    }
  }, [tooltip]);

  const handleMouseOver = useCallback((e: MouseEvent) => {
    const nextTarget = getMouseTooltipTarget(e.target);
    if (nextTarget) {
      currentElementRef.current = nextTarget.element;
      setTooltip(nextTarget.text);
    }
  }, []);

  const handleMouseOut = useCallback((e: MouseEvent) => {
    if (shouldClearMouseTooltipOnMouseOut(e.relatedTarget)) {
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

  if (touchMode || !tooltip) return null;

  return (
    <div
      className="fixed pointer-events-none"
      style={getMouseTooltipStyle(mousePos)}
    >
      <div className={`${hoverCardStyles.container} border border-ds rounded text-xs px-2 py-1 whitespace-pre-line max-w-xs`}>
        {renderMouseTooltipContent(tooltip)}
      </div>
    </div>
  );
}
