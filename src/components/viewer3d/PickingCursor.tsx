import { useState, useEffect } from 'react';
import { usePointPickingStore } from '../../store';

// Colors for point indicators: P1=red, P2=green, P3=blue (matching SelectedPointMarkers)
const POINT_COLORS = ['#ff4444', '#44ff44', '#4444ff'];
const POINT_LABELS = ['P1', 'P2', 'P3'];

/**
 * Cursor-following tooltip that shows picking status during point selection.
 * Displays which point is being selected with matching color coding.
 */
export function PickingCursor() {
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  // Only subscribe to length to avoid re-renders when point contents change
  const selectedPointsLength = usePointPickingStore((s) => s.selectedPoints.length);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const requiredPoints = pickingMode === 'origin-1pt' ? 1 : pickingMode === 'distance-2pt' ? 2 : pickingMode === 'normal-3pt' ? 3 : 0;
  const isActive = pickingMode !== 'off';
  const nextPointIndex = selectedPointsLength;
  const isComplete = nextPointIndex >= requiredPoints;

  useEffect(() => {
    if (!isActive) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isActive]);

  // Don't show cursor when not active or when all points are selected
  if (!isActive || isComplete) return null;

  const nextColor = POINT_COLORS[nextPointIndex] || POINT_COLORS[0];
  const nextLabel = POINT_LABELS[nextPointIndex] || 'P1';

  return (
    <div
      className="fixed pointer-events-none z-[1000]"
      style={{
        left: mousePos.x + 16,
        top: mousePos.y + 16,
      }}
    >
      <div className="bg-black/90 text-white text-xs px-2 py-1.5 rounded whitespace-nowrap flex items-center gap-2">
        <span
          className="w-3 h-3 rounded-full inline-block"
          style={{ backgroundColor: nextColor }}
        />
        <span>Select <strong>{nextLabel}</strong></span>
      </div>
    </div>
  );
}
