import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { useHotkeys } from 'react-hotkeys-hook';
import { usePointPickingStore, useTransformStore, useUIStore } from '../../store';
import { computeDistanceScale, computeNormalAlignment, computeOriginTranslation, sim3dToEuler, composeSim3d, createSim3dFromEuler } from '../../utils/sim3dTransforms';
import { COORDINATE_SYSTEMS } from '../../utils/coordinateSystems';
import { controlPanelStyles, modalStyles } from '../../theme';

/**
 * Confirmation popup for point picking tools.
 * - 2-point scale: shows distance input + tick/retry/cancel
 * - 3-point align: shows tick/retry/cancel (no input)
 *
 * tick = confirm (apply transform)
 * X = retry (clear points, stay in picking mode)
 * click outside = cancel (exit picking mode)
 */
export function DistanceInputModal() {
  const showDistanceModal = usePointPickingStore((s) => s.showDistanceModal);
  const modalPosition = usePointPickingStore((s) => s.modalPosition);
  const setShowDistanceModal = usePointPickingStore((s) => s.setShowDistanceModal);
  const selectedPoints = usePointPickingStore((s) => s.selectedPoints);
  const setTargetDistance = usePointPickingStore((s) => s.setTargetDistance);
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const clearSelectedPoints = usePointPickingStore((s) => s.clearSelectedPoints);
  const normalFlipped = usePointPickingStore((s) => s.normalFlipped);
  const targetAxis = usePointPickingStore((s) => s.targetAxis);
  const reset = usePointPickingStore((s) => s.reset);
  const transform = useTransformStore((s) => s.transform);
  const setTransform = useTransformStore((s) => s.setTransform);
  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);

  const is1PointMode = pickingMode === 'origin-1pt';
  const is3PointMode = pickingMode === 'normal-3pt';

  // Get target direction based on selected axis and coordinate system
  // Maps the axis name (X, Y, Z) to the actual direction vector in the coordinate system
  const targetUp = useMemo(() => {
    const system = COORDINATE_SYSTEMS[axesCoordinateSystem];
    const axisKey = targetAxis.toLowerCase() as 'x' | 'y' | 'z';
    const direction = system[axisKey];
    return new THREE.Vector3(direction[0], direction[1], direction[2]);
  }, [axesCoordinateSystem, targetAxis]);

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

  // Initialize input with current distance when modal opens
  useEffect(() => {
    if (showDistanceModal && currentDistance !== null) {
      setInputValue(currentDistance.toFixed(4));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only initialize on modal open, not when currentDistance changes
  }, [showDistanceModal]);

  // Cancel: exit picking mode entirely
  const handleCancel = useCallback(() => {
    setShowDistanceModal(false);
    reset();
  }, [setShowDistanceModal, reset]);

  // Close with Escape - cancels picking mode
  useHotkeys(
    'escape',
    () => handleCancel(),
    { enabled: showDistanceModal },
    [showDistanceModal, handleCancel]
  );

  // Retry: clear points but stay in picking mode
  const handleRetry = useCallback(() => {
    setShowDistanceModal(false);
    clearSelectedPoints();
  }, [setShowDistanceModal, clearSelectedPoints]);

  // Apply: compute and apply the transform
  const handleApply = useCallback(() => {
    if (is1PointMode) {
      // 1-point origin translation
      if (selectedPoints.length !== 1) return;

      const originTransform = computeOriginTranslation(selectedPoints[0].position);

      const currentSim3d = createSim3dFromEuler(transform);
      const composed = composeSim3d(originTransform, currentSim3d);
      const composedEuler = sim3dToEuler(composed);

      setTransform(composedEuler);
      setShowDistanceModal(false);
      reset();
    } else if (is3PointMode) {
      // 3-point normal alignment
      if (selectedPoints.length !== 3) return;

      const alignTransform = computeNormalAlignment(
        selectedPoints[0].position,
        selectedPoints[1].position,
        selectedPoints[2].position,
        normalFlipped,
        targetUp
      );

      const currentSim3d = createSim3dFromEuler(transform);
      const composed = composeSim3d(alignTransform, currentSim3d);
      const composedEuler = sim3dToEuler(composed);

      setTransform(composedEuler);
      setShowDistanceModal(false);
      reset();
    } else {
      // 2-point distance scale
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
    }
  }, [is1PointMode, is3PointMode, inputValue, selectedPoints, normalFlipped, transform, setTransform, setTargetDistance, setShowDistanceModal, reset, targetUp]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleApply();
    }
  }, [handleApply]);

  if (!showDistanceModal) return null;

  return (
    <div
      ref={modalRef}
      className="fixed z-[1100] bg-ds-tertiary border border-ds rounded shadow-ds-lg p-1"
      style={computedPosition}
    >
        <div className="flex items-center gap-0.5">
          {/* Distance input only for 2-point mode (not for 1-point origin or 3-point align) */}
          {!is1PointMode && !is3PointMode && (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className={`${controlPanelStyles.valueInput} w-14 font-mono`}
              title="Target distance"
            />
          )}
          {/* Confirm button (tick) */}
          <button
            onClick={handleApply}
            className={modalStyles.iconButtonConfirm}
            title="Confirm"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </button>
          {/* Retry button - clear points but stay in mode */}
          <button
            onClick={handleRetry}
            className={modalStyles.iconButtonRetry}
            title="Retry"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          {/* Cancel button (X) - exit picking mode */}
          <button
            onClick={handleCancel}
            className={modalStyles.iconButtonCancel}
            title="Cancel"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
    </div>
  );
}
