import { useState, useEffect } from 'react';
import { usePointPickingStore } from '../../store';

/**
 * Cursor-following tooltip that shows picking status during point selection.
 */
export function PickingCursor() {
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const selectedPoints = usePointPickingStore((s) => s.selectedPoints);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const requiredPoints = pickingMode === 'distance-2pt' ? 2 : pickingMode === 'normal-3pt' ? 3 : 0;
  const isActive = pickingMode !== 'off';

  useEffect(() => {
    if (!isActive) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div
      className="fixed pointer-events-none z-[1000]"
      style={{
        left: mousePos.x + 16,
        top: mousePos.y + 16,
      }}
    >
      <div className="bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
        {selectedPoints.length}/{requiredPoints}
      </div>
    </div>
  );
}
