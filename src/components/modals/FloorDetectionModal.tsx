/**
 * Modal for floor detection tool with RANSAC parameters.
 * Triggered from TransformPanel button.
 */

import { useCallback, memo, useMemo } from 'react';
import { SliderRow, SelectRow } from '../viewer3d/ControlComponents';
import * as THREE from 'three';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  useReconstructionStore,
  useTransformStore,
  useUIStore,
} from '../../store';
import { useModalZIndex } from '../../hooks/useModalZIndex';
import { useModalDrag } from '../../hooks/useModalDrag';
import { useFloorPlaneStore, type FloorColorMode } from '../../store/stores/floorPlaneStore';
import { detectPlaneRANSAC, computeDistancesToPlane, transformPositions, flipPlaneNormal } from '../../utils/ransac';
import { createSim3dFromEuler, isIdentityEuler, sim3dToEuler, composeSim3d } from '../../utils/sim3dTransforms';
import { COORDINATE_SYSTEMS } from '../../utils/coordinateSystems';
import { modalStyles, controlPanelStyles } from '../../theme';
import { CloseIcon } from '../../icons';
import type { Sim3d } from '../../types/sim3d';

const styles = controlPanelStyles;

/**
 * Compute the transform that aligns a plane normal to a target axis and moves the floor to the origin.
 * 1. Rotates so the plane normal aligns with the target axis
 * 2. Translates so the floor plane passes through the origin
 */
function computePlaneAlignment(
  normal: [number, number, number],
  centroid: [number, number, number],
  targetUp: THREE.Vector3
): Sim3d {
  const normalVec = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
  const centroidVec = new THREE.Vector3(centroid[0], centroid[1], centroid[2]);

  // Compute rotation quaternion to align normal with target up
  const rotation = new THREE.Quaternion();
  rotation.setFromUnitVectors(normalVec, targetUp);

  // Apply rotation to centroid to find where it ends up after rotation
  const rotatedCentroid = centroidVec.clone().applyQuaternion(rotation);

  // Compute translation to move the floor to the origin
  // After rotation, the floor normal is aligned with targetUp, so we need to
  // translate along targetUp to make the floor pass through y=0 (or z=0, etc.)
  // The distance to translate is the component of rotatedCentroid along targetUp
  const distanceAlongAxis = rotatedCentroid.dot(targetUp);
  const translation = targetUp.clone().multiplyScalar(-distanceAlongAxis);

  return {
    rotation,
    translation,
    scale: 1,
  };
}

export interface FloorDetectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FloorDetectionModal = memo(function FloorDetectionModal({
  isOpen,
  onClose,
}: FloorDetectionModalProps) {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  const transform = useTransformStore((s) => s.transform);
  const setTransform = useTransformStore((s) => s.setTransform);
  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);

  // Floor plane store
  const detectedPlane = useFloorPlaneStore((s) => s.detectedPlane);
  const setDetectedPlane = useFloorPlaneStore((s) => s.setDetectedPlane);
  const distanceThreshold = useFloorPlaneStore((s) => s.distanceThreshold);
  const setDistanceThreshold = useFloorPlaneStore((s) => s.setDistanceThreshold);
  const sampleCount = useFloorPlaneStore((s) => s.sampleCount);
  const setSampleCount = useFloorPlaneStore((s) => s.setSampleCount);
  const floorColorMode = useFloorPlaneStore((s) => s.floorColorMode);
  const setFloorColorMode = useFloorPlaneStore((s) => s.setFloorColorMode);
  const setPointDistances = useFloorPlaneStore((s) => s.setPointDistances);
  const isDetecting = useFloorPlaneStore((s) => s.isDetecting);
  const setIsDetecting = useFloorPlaneStore((s) => s.setIsDetecting);
  const normalFlipped = useFloorPlaneStore((s) => s.normalFlipped);
  const toggleNormalFlipped = useFloorPlaneStore((s) => s.toggleNormalFlipped);
  const targetAxis = useFloorPlaneStore((s) => s.targetAxis);
  const cycleTargetAxis = useFloorPlaneStore((s) => s.cycleTargetAxis);
  const reset = useFloorPlaneStore((s) => s.reset);

  const pointCount = wasmReconstruction?.pointCount ?? reconstruction?.points3D?.size ?? 0;

  // Get target direction based on selected axis and coordinate system
  const targetUp = useMemo(() => {
    const system = COORDINATE_SYSTEMS[axesCoordinateSystem];
    const axisKey = targetAxis.toLowerCase() as 'x' | 'y' | 'z';
    const direction = system[axisKey];
    return new THREE.Vector3(direction[0], direction[1], direction[2]);
  }, [axesCoordinateSystem, targetAxis]);

  // Position and drag
  const { position, panelRef, handleDragStart } = useModalDrag({
    estimatedWidth: 280, estimatedHeight: 300, isOpen,
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
      let positions = wasmReconstruction.getPositions();
      if (!positions) {
        setIsDetecting(false);
        return;
      }

      // Apply current transform if not identity (so detection matches visual)
      if (!isIdentityEuler(transform)) {
        const sim3d = createSim3dFromEuler(transform);
        positions = transformPositions(positions, sim3d);
      }

      const plane = detectPlaneRANSAC(positions, { distanceThreshold, sampleCount });
      setDetectedPlane(plane);

      if (plane) {
        const distances = computeDistancesToPlane(positions, plane);
        setPointDistances(distances);
        if (floorColorMode === 'off') {
          setFloorColorMode('binary');
        }
      } else {
        setPointDistances(null);
      }

      setIsDetecting(false);
    }, 10);
  }, [wasmReconstruction, distanceThreshold, sampleCount, transform, setDetectedPlane, setPointDistances, setIsDetecting, floorColorMode, setFloorColorMode]);

  const handleClear = useCallback(() => {
    reset();
  }, [reset]);

  // Apply: compute and apply the alignment transform
  const handleApply = useCallback(() => {
    if (!detectedPlane) return;

    // Get the plane normal (flipped if needed)
    const plane = normalFlipped ? flipPlaneNormal(detectedPlane) : detectedPlane;

    // Compute the alignment transform (rotation + translation to origin)
    const alignSim3d = computePlaneAlignment(plane.normal, plane.centroid, targetUp);

    // Compose with current transform
    const currentSim3d = createSim3dFromEuler(transform);
    const composed = composeSim3d(alignSim3d, currentSim3d);
    const composedEuler = sim3dToEuler(composed);

    setTransform(composedEuler);
    reset();
    onClose();
  }, [detectedPlane, normalFlipped, targetUp, transform, setTransform, reset, onClose]);

  const inlierPercentage = detectedPlane && pointCount > 0
    ? ((detectedPlane.inlierCount / pointCount) * 100).toFixed(1)
    : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
      <div
        ref={panelRef}
        className={modalStyles.toolPanel}
        style={{ left: position.x, top: position.y, width: 280 }}
        onPointerDown={bringToFront}
      >
        {/* Header */}
        <div
          className={modalStyles.toolHeader}
          onPointerDown={handleDragStart}
          style={{ touchAction: 'none' }}
        >
          <span className={modalStyles.toolHeaderTitle}>Floor Detection</span>
          <button
            onClick={handleClose}
            onPointerDown={(e) => e.stopPropagation()}
            className={modalStyles.toolHeaderClose}
            title="Close"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>

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
            formatValue={(v) => `${(v / 1000).toFixed(0)}k`}
          />
          <SelectRow
            label="Color"
            value={floorColorMode}
            onChange={(v) => setFloorColorMode(v as FloorColorMode)}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'binary', label: 'Binary (In/Out)' },
              { value: 'distance', label: 'Distance' },
            ]}
          />

          {/* Flip/Axis buttons - always visible, disabled when no plane */}
          <div className={styles.actionGroup}>
            <button
              onClick={toggleNormalFlipped}
              disabled={!detectedPlane}
              className={detectedPlane ? styles.actionButton : styles.actionButtonDisabled}
              title="Flip the detected plane normal direction"
            >
              Flip
            </button>
            <button
              onClick={cycleTargetAxis}
              disabled={!detectedPlane}
              className={detectedPlane ? styles.actionButton : styles.actionButtonDisabled}
              title="Change target alignment axis"
            >
              Axis: {targetAxis}
            </button>
          </div>

          {/* Status info */}
          {detectedPlane ? (
            <div className="text-ds-secondary text-sm">
              <div className="mb-1 font-medium">Detection Result:</div>
              <div>{inlierPercentage}% inliers ({detectedPlane.inlierCount.toLocaleString()} pts)</div>
            </div>
          ) : (
            <div className="text-ds-secondary text-sm">
              <div className="mb-1 font-medium">RANSAC Floor Detection:</div>
              <div>Detect dominant plane in the</div>
              <div>point cloud for alignment.</div>
            </div>
          )}

          {/* Action buttons at bottom */}
          <div className={styles.actionGroup}>
            <button
              onClick={handleDetectFloor}
              disabled={isDetecting || !wasmReconstruction?.hasPoints()}
              className={isDetecting || !wasmReconstruction?.hasPoints() ? styles.actionButtonDisabled : styles.actionButtonPrimary}
              style={{ flex: 1 }}
            >
              {isDetecting ? 'Detecting...' : detectedPlane ? 'Re-detect' : 'Detect'}
            </button>
          </div>
          <div className={styles.actionGroup}>
            <button
              onClick={handleApply}
              disabled={!detectedPlane}
              className={detectedPlane ? styles.actionButtonPrimary : styles.actionButtonPrimaryDisabled}
            >
              Apply
            </button>
            <button
              onClick={handleClear}
              disabled={!detectedPlane}
              className={detectedPlane ? styles.actionButton : styles.actionButtonDisabled}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
