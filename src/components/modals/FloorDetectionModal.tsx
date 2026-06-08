/**
 * Modal for floor detection tool with RANSAC parameters.
 * Triggered from TransformPanel button.
 */

import { useCallback, memo, useMemo } from 'react';
import { SliderRow, SelectRow } from '../viewer3d/ControlComponents';
import { useHotkeys } from 'react-hotkeys-hook';
import { useModalZIndex } from '../../hooks/useModalZIndex';
import { useModalDrag } from '../../hooks/useModalDrag';
import { controlPanelStyles } from '../../theme';
import { FloatingWindowShell } from '../ui/FloatingWindowShell';
import {
  FLOOR_COLOR_MODE_OPTIONS,
  FLOOR_DETECTION_MODAL_ESTIMATED_HEIGHT,
  FLOOR_DETECTION_MODAL_ESTIMATED_WIDTH,
  computeFloorAlignmentTransform,
  detectFloorPlaneFromPositions,
  formatFloorSampleCount,
  getFloorDetectionButtonStyle,
  getFloorColorModeAfterDetection,
  getFloorDetectionModalPanelStyle,
  getFloorDetectedPlaneActionState,
  getFloorDetectionActionState,
  getFloorDetectionStatusInfo,
  getFloorNormalFlippedForCameraDownSide,
  getFloorModalHeaderDragStyle,
  getFloorModalOverlayStyle,
  getFloorPlaneControlState,
  getFloorTargetUpVector,
} from './floorPlaneAlignmentPolicy';
import { useFloorDetectionStoreFacade } from './useFloorDetectionStoreFacade';

const styles = controlPanelStyles;

export interface FloorDetectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FloorDetectionModal = memo(function FloorDetectionModal({
  isOpen,
  onClose,
}: FloorDetectionModalProps) {
  const {
    data: { reconstruction, wasmReconstruction },
    floor: {
      detectedPlane,
      distanceThreshold,
      sampleCount,
      floorColorMode,
      isDetecting,
      normalFlipped,
      targetAxis,
      setDetectedPlane,
      setDistanceThreshold,
      setSampleCount,
      setFloorColorMode,
      setPointDistances,
      setIsDetecting,
      toggleNormalFlipped,
      setNormalFlipped,
      cycleTargetAxis,
      reset,
    },
    transform: { transform, setTransform },
    ui: { axesCoordinateSystem },
  } = useFloorDetectionStoreFacade();

  const pointCount = wasmReconstruction?.pointCount ?? reconstruction?.points3D?.size ?? 0;
  const hasFloorDetectionPoints = wasmReconstruction?.hasPoints() ?? false;

  // Get target direction based on selected axis and coordinate system
  const targetUp = useMemo(() => {
    return getFloorTargetUpVector(axesCoordinateSystem, targetAxis);
  }, [axesCoordinateSystem, targetAxis]);

  // Position and drag
  const { position, panelRef, handleDragStart } = useModalDrag({
    estimatedWidth: FLOOR_DETECTION_MODAL_ESTIMATED_WIDTH,
    estimatedHeight: FLOOR_DETECTION_MODAL_ESTIMATED_HEIGHT,
    isOpen,
  });

  // Z-index management for stacking multiple modals
  const { zIndex, bringToFront } = useModalZIndex(isOpen);

  // Close handler - also clears detection
  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  useHotkeys('escape', handleClose, { enabled: isOpen }, [isOpen, handleClose]);

  const handleDetectFloor = useCallback(() => {
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
        sampleCount,
      });
      setDetectedPlane(result.plane);
      setPointDistances(result.distances);
      setNormalFlipped(
        getFloorNormalFlippedForCameraDownSide(
          result.plane,
          reconstruction?.images.values() ?? [],
          transform
        )
      );

      const nextFloorColorMode = getFloorColorModeAfterDetection(floorColorMode, result.plane);
      if (nextFloorColorMode !== floorColorMode) {
        setFloorColorMode(nextFloorColorMode);
      }

      setIsDetecting(false);
    }, 10);
  }, [
    wasmReconstruction,
    reconstruction,
    distanceThreshold,
    sampleCount,
    transform,
    setDetectedPlane,
    setPointDistances,
    setNormalFlipped,
    setIsDetecting,
    floorColorMode,
    setFloorColorMode,
  ]);

  const handleClear = useCallback(() => {
    reset();
  }, [reset]);

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
    reset();
    onClose();
  }, [detectedPlane, normalFlipped, targetUp, transform, setTransform, reset, onClose]);

  const planeControls = getFloorPlaneControlState(detectedPlane, targetAxis);
  const detectionAction = getFloorDetectionActionState({
    isDetecting,
    hasPoints: hasFloorDetectionPoints,
    hasPlane: detectedPlane !== null,
  });
  const detectedPlaneAction = getFloorDetectedPlaneActionState(detectedPlane);
  const statusInfo = getFloorDetectionStatusInfo(detectedPlane, pointCount);

  if (!isOpen) return null;

  return (
    <FloatingWindowShell
      isOpen={isOpen}
      title="Floor Detection"
      onClose={handleClose}
      panelRef={panelRef}
      overlayStyle={getFloorModalOverlayStyle(zIndex)}
      panelStyle={getFloorDetectionModalPanelStyle(position)}
      headerStyle={getFloorModalHeaderDragStyle()}
      onPanelPointerDown={bringToFront}
      onHeaderPointerDown={handleDragStart}
    >
        {/* Content */}
        <div className={`px-4 py-3 ${styles.panelContent}`}>
          {/* Settings */}
          <SliderRow
            label="Threshold"
            value={distanceThreshold}
            min={0.001}
            max={0.5}
            step={0.001}
            onChange={setDistanceThreshold}
            formatValue={(v) => v.toFixed(3)}
          />
          <SliderRow
            label="Samples"
            value={sampleCount}
            min={1000}
            max={100000}
            step={1000}
            onChange={setSampleCount}
            formatValue={formatFloorSampleCount}
          />
          <SelectRow
            label="Color"
            value={floorColorMode}
            onChange={setFloorColorMode}
            options={FLOOR_COLOR_MODE_OPTIONS}
          />

          {/* Flip/Axis buttons - always visible, disabled when no plane */}
          <div className={styles.actionGroup}>
            <button
              onClick={toggleNormalFlipped}
              disabled={planeControls.disabled}
              className={planeControls.disabled ? styles.actionButtonDisabled : styles.actionButton}
              title="Flip the detected plane normal direction"
            >
              Flip
            </button>
            <button
              onClick={cycleTargetAxis}
              disabled={planeControls.disabled}
              className={planeControls.disabled ? styles.actionButtonDisabled : styles.actionButton}
              title="Change target alignment axis"
            >
              {planeControls.axisLabel}
            </button>
          </div>

          {/* Status info */}
          <div className="text-ds-secondary text-sm">
            <div className="mb-1 font-medium">{statusInfo.heading}</div>
            {statusInfo.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>

          {/* Action buttons at bottom */}
          <div className={styles.actionGroup}>
            <button
              onClick={handleDetectFloor}
              disabled={detectionAction.disabled}
              className={detectionAction.disabled ? styles.actionButtonDisabled : styles.actionButtonPrimary}
              style={getFloorDetectionButtonStyle()}
            >
              {detectionAction.label}
            </button>
          </div>
          <div className={styles.actionGroup}>
            <button
              onClick={handleApply}
              disabled={detectedPlaneAction.disabled}
              className={detectedPlaneAction.disabled ? styles.actionButtonPrimaryDisabled : styles.actionButtonPrimary}
            >
              Apply
            </button>
            <button
              onClick={handleClear}
              disabled={detectedPlaneAction.disabled}
              className={detectedPlaneAction.disabled ? styles.actionButtonDisabled : styles.actionButton}
            >
              Clear
            </button>
          </div>
        </div>
    </FloatingWindowShell>
  );
});
