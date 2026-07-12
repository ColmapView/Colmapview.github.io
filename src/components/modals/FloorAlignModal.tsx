import { useMemo, useCallback } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { modalStyles } from '../../theme';
import { useModalDrag } from '../../hooks/useModalDrag';
import {
  FLOOR_ALIGN_MODAL_ESTIMATED_HEIGHT,
  FLOOR_ALIGN_MODAL_ESTIMATED_WIDTH,
  computeFloorAlignmentTransform,
  detectFloorPlaneFromPositions,
  getFloorAlignModalPanelStyle,
  getFloorNormalFlippedForCameraDownSide,
  getFloorTargetUpVector,
} from './floorPlaneAlignmentPolicy';
import { useFloorAlignStoreFacade } from './useFloorAlignStoreFacade';

/**
 * Confirmation modal for floor plane alignment.
 * Shows: ✓ Apply | ↻ Re-detect | × Cancel
 */
export function FloorAlignModal() {
  const {
    data: { reconstruction, wasmReconstruction },
    floor: {
      showFloorModal,
      modalPosition,
      detectedPlane,
      normalFlipped,
      targetAxis,
      distanceThreshold,
      maxIterations,
      sampleCount,
      setShowFloorModal,
      setDetectedPlane,
      setPointDistances,
      setIsDetecting,
      setNormalFlipped,
      reset,
    },
    transform: { transform, setTransform },
    ui: { axesCoordinateSystem },
  } = useFloorAlignStoreFacade();

  // Get target direction based on selected axis and coordinate system
  const targetUp = useMemo(() => {
    return getFloorTargetUpVector(axesCoordinateSystem, targetAxis);
  }, [axesCoordinateSystem, targetAxis]);

  const { position, panelRef, handleDragStart } = useModalDrag({
    estimatedWidth: FLOOR_ALIGN_MODAL_ESTIMATED_WIDTH,
    estimatedHeight: FLOOR_ALIGN_MODAL_ESTIMATED_HEIGHT,
    isOpen: showFloorModal,
    initialPosition: modalPosition,
  });

  // Cancel: clear detection and close
  const handleCancel = useCallback(() => {
    setShowFloorModal(false);
    reset();
  }, [setShowFloorModal, reset]);

  // Close with Escape
  useHotkeys(
    'escape',
    () => handleCancel(),
    { enabled: showFloorModal },
    [showFloorModal, handleCancel]
  );

  // Retry: re-run RANSAC detection
  const handleRetry = useCallback(() => {
    if (!wasmReconstruction?.hasPoints()) return;

    setIsDetecting(true);

    // Use setTimeout to allow UI to update before potentially blocking operation
    setTimeout(() => {
      const positions = wasmReconstruction.getPositions();
      if (!positions) {
        setIsDetecting(false);
        return;
      }

      const result = detectFloorPlaneFromPositions(positions, transform, {
        distanceThreshold,
        maxIterations,
        sampleCount,
      });
      setDetectedPlane(result.plane);
      setPointDistances(result.distances);
      setNormalFlipped(
        getFloorNormalFlippedForCameraDownSide(
          result.plane,
          reconstruction?.images.values() ?? [],
          transform,
          undefined,
          // Tie-breaker when cameras split evenly or are absent; already in
          // the transformed frame, matching the fitted plane.
          result.positions
        )
      );

      setIsDetecting(false);
    }, 10);
  }, [
    wasmReconstruction,
    reconstruction,
    distanceThreshold,
    maxIterations,
    sampleCount,
    transform,
    setDetectedPlane,
    setPointDistances,
    setNormalFlipped,
    setIsDetecting,
  ]);

  // Apply: compute and apply the alignment transform
  const handleApply = useCallback(() => {
    if (!detectedPlane) return;

    const composedEuler = computeFloorAlignmentTransform(
      detectedPlane,
      normalFlipped,
      targetUp,
      transform
    );

    setTransform(composedEuler);
    setShowFloorModal(false);
    reset();
  }, [detectedPlane, normalFlipped, targetUp, transform, setTransform, setShowFloorModal, reset]);

  if (!showFloorModal || !detectedPlane) return null;

  return (
    <div
      ref={panelRef}
      className="fixed bg-ds-tertiary border border-ds rounded shadow-ds-lg p-1"
      style={getFloorAlignModalPanelStyle(position)}
      onPointerDown={handleDragStart}
    >
      <div className="flex items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
        {/* Confirm button (tick) */}
        <button
          onClick={handleApply}
          className={modalStyles.iconButtonConfirm}
          title="Apply alignment"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </button>
        {/* Retry button - re-run RANSAC */}
        <button
          onClick={handleRetry}
          className={modalStyles.iconButtonRetry}
          title="Re-detect floor"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
        {/* Cancel button (X) */}
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
