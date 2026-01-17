import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { usePointPickingStore, useTransformStore } from '../../store';
import { computeDistanceScale, sim3dToEuler, composeSim3d, createSim3dFromEuler } from '../../utils/sim3dTransforms';

/**
 * Compact popup for entering target distance when using the 2-point scale tool.
 * Appears near the mouse position where the second point was clicked.
 */
export function DistanceInputModal() {
  const showDistanceModal = usePointPickingStore((s) => s.showDistanceModal);
  const modalPosition = usePointPickingStore((s) => s.modalPosition);
  const setShowDistanceModal = usePointPickingStore((s) => s.setShowDistanceModal);
  const selectedPoints = usePointPickingStore((s) => s.selectedPoints);
  const setTargetDistance = usePointPickingStore((s) => s.setTargetDistance);
  const reset = usePointPickingStore((s) => s.reset);
  const transform = useTransformStore((s) => s.transform);
  const setTransform = useTransformStore((s) => s.setTransform);

  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Compute current distance between selected points
  const currentDistance = selectedPoints.length === 2
    ? selectedPoints[0].position.distanceTo(selectedPoints[1].position)
    : null;

  // Calculate modal position with boundary checking
  const computedPosition = useMemo(() => {
    if (!modalPosition) {
      return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
    }

    const modalWidth = 200;
    const modalHeight = 80;
    const padding = 16;

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;

    let x = modalPosition.x + 8;
    let y = modalPosition.y - 8;

    if (x + modalWidth + padding > viewportWidth) {
      x = modalPosition.x - modalWidth - 20;
    }
    if (y + modalHeight + padding > viewportHeight) {
      y = viewportHeight - modalHeight - padding;
    }
    if (y < padding) {
      y = padding;
    }
    if (x < padding) {
      x = padding;
    }

    return { left: `${x}px`, top: `${y}px`, transform: 'none' };
  }, [modalPosition]);

  // Focus input when modal opens
  useEffect(() => {
    if (showDistanceModal && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [showDistanceModal]);

  // Initialize input with current distance
  useEffect(() => {
    if (showDistanceModal && currentDistance !== null) {
      setInputValue(currentDistance.toFixed(4));
    }
  }, [showDistanceModal, currentDistance]);

  // Close with Escape
  useHotkeys(
    'escape',
    () => handleCancel(),
    { enabled: showDistanceModal },
    [showDistanceModal]
  );

  const handleCancel = useCallback(() => {
    setShowDistanceModal(false);
    reset();
  }, [setShowDistanceModal, reset]);

  const handleApply = useCallback(() => {
    const value = parseFloat(inputValue);
    if (isNaN(value) || value <= 0) return;
    if (selectedPoints.length !== 2) return;

    const scaleTransform = computeDistanceScale(
      selectedPoints[0].position,
      selectedPoints[1].position,
      value
    );

    const currentSim3d = createSim3dFromEuler(transform);
    const composed = composeSim3d(scaleTransform, currentSim3d);
    const composedEuler = sim3dToEuler(composed);

    setTransform(composedEuler);
    setTargetDistance(value);
    setShowDistanceModal(false);
    reset();
  }, [inputValue, selectedPoints, transform, setTransform, setTargetDistance, setShowDistanceModal, reset]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleApply();
    }
  }, [handleApply]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      handleCancel();
    }
  }, [handleCancel]);

  if (!showDistanceModal) return null;

  return (
    <div
      className="fixed inset-0 z-[1100]"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="absolute bg-ds-tertiary border border-ds rounded shadow-ds-lg p-1"
        style={computedPosition}
      >
        <div className="flex items-center gap-0.5">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-16 px-1 py-0.5 bg-ds-secondary border border-ds-subtle rounded text-ds-primary text-xs font-mono outline-none focus:outline-none focus:ring-0 focus:border-ds-subtle"
          />
          <button
            onClick={handleApply}
            className="p-0.5 text-green-400 hover:text-green-300 transition-colors flex items-center"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </button>
          <button
            onClick={handleCancel}
            className="p-0.5 text-red-400 hover:text-red-300 transition-colors flex items-center"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
