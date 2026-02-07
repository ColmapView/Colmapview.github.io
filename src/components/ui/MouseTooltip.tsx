import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { hoverCardStyles, ICON_SIZES } from '../../theme';
import { MouseLeftIcon, MouseRightIcon, MouseScrollIcon } from '../../icons';
import { useUIStore } from '../../store/stores/uiStore';

/**
 * Parse tooltip text and replace {LMB}, {RMB}, {SCROLL} markers with mouse icons.
 * Returns an array of ReactNodes for rendering.
 */
function parseTooltipContent(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\{(LMB|RMB|SCROLL)\}/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the marker
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add the icon
    const iconType = match[1];
    if (iconType === 'LMB') {
      parts.push(<MouseLeftIcon key={`icon-${match.index}`} className={`${ICON_SIZES.hoverCard} inline-block align-text-bottom`} />);
    } else if (iconType === 'RMB') {
      parts.push(<MouseRightIcon key={`icon-${match.index}`} className={`${ICON_SIZES.hoverCard} inline-block align-text-bottom`} />);
    } else if (iconType === 'SCROLL') {
      parts.push(<MouseScrollIcon key={`icon-${match.index}`} className={`${ICON_SIZES.hoverCard} inline-block align-text-bottom`} />);
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
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
  const touchMode = useUIStore((s) => s.touchMode);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const currentElementRef = useRef<HTMLElement | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });

    // Check if we're still over a tooltip element (handles cases where elements get removed)
    const target = e.target as HTMLElement;
    const tooltipEl = target.closest('[data-tooltip]') as HTMLElement | null;

    if (tooltipEl) {
      // Update tooltip if over a different element or same element with different text
      if (tooltipEl !== currentElementRef.current || tooltipEl.dataset.tooltip !== tooltip) {
        currentElementRef.current = tooltipEl;
        setTooltip(tooltipEl.dataset.tooltip || null);
      }
    } else if (currentElementRef.current) {
      // No longer over a tooltip element
      currentElementRef.current = null;
      setTooltip(null);
    }
  }, [tooltip]);

  const handleMouseOver = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const tooltipEl = target.closest('[data-tooltip]') as HTMLElement | null;
    if (tooltipEl) {
      currentElementRef.current = tooltipEl;
      setTooltip(tooltipEl.dataset.tooltip || null);
    }
  }, []);

  const handleMouseOut = useCallback((e: MouseEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null;

    // Clear if leaving window or moving to element without tooltip
    if (!relatedTarget) {
      currentElementRef.current = null;
      setTooltip(null);
      return;
    }

    const newTooltipEl = relatedTarget.closest('[data-tooltip]') as HTMLElement | null;
    if (!newTooltipEl) {
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
      className="fixed pointer-events-none z-[9999]"
      style={{
        right: `calc(100vw - ${mousePos.x}px + 12px)`,
        top: mousePos.y + 12,
      }}
    >
      <div className={`${hoverCardStyles.container} border border-ds rounded text-xs px-2 py-1 whitespace-pre-line max-w-xs`}>
        {parseTooltipContent(tooltip)}
      </div>
    </div>
  );
}
