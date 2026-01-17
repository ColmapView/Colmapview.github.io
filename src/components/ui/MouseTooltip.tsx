import { useState, useEffect, useCallback } from 'react';

/**
 * Global mouse-following tooltip that displays content from data-tooltip attributes.
 * Replaces CSS-only tooltips with a dynamic mouse-tracking version.
 */
export function MouseTooltip() {
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseOver = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const tooltipEl = target.closest('[data-tooltip]') as HTMLElement | null;
    if (tooltipEl) {
      setTooltip(tooltipEl.dataset.tooltip || null);
    }
  }, []);

  const handleMouseOut = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const tooltipEl = target.closest('[data-tooltip]') as HTMLElement | null;
    const relatedTarget = e.relatedTarget as HTMLElement | null;

    // Only hide if we're leaving the tooltip element entirely
    if (tooltipEl && (!relatedTarget || !tooltipEl.contains(relatedTarget))) {
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
      <div className="bg-ds-tertiary border border-ds rounded shadow-ds-lg text-ds-primary text-xs px-2 py-1 whitespace-nowrap">
        {tooltip}
      </div>
    </div>
  );
}
