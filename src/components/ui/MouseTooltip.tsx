import { useState, useEffect, useCallback, useRef } from 'react';
import { hoverCardStyles } from '../../theme';

/**
 * Global mouse-following tooltip that displays content from data-tooltip attributes.
 * Replaces CSS-only tooltips with a dynamic mouse-tracking version.
 */
export function MouseTooltip() {
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
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
    };
  }, [handleMouseMove, handleMouseOver, handleMouseOut]);

  if (!tooltip) return null;

  return (
    <div
      className="fixed pointer-events-none z-[9999]"
      style={{
        right: `calc(100vw - ${mousePos.x}px + 12px)`,
        top: mousePos.y + 12,
      }}
    >
      <div className={`${hoverCardStyles.container} border border-ds rounded text-xs px-2 py-1`}>
        {tooltip}
      </div>
    </div>
  );
}
