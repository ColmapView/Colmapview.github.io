import { useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { useHotkeys } from 'react-hotkeys-hook';
import { useFloorPlaneStore } from '../../store/stores/floorPlaneStore';
import { useTransformStore, useUIStore, useReconstructionStore } from '../../store';
import { modalStyles, Z_INDEX } from '../../theme';
import { flipPlaneNormal, detectPlaneRANSAC, computeDistancesToPlane, transformPositions } from '../../utils/ransac';
import { sim3dToEuler, composeSim3d, createSim3dFromEuler, isIdentityEuler } from '../../utils/sim3dTransforms';
import { COORDINATE_SYSTEMS } from '../../utils/coordinateSystems';
import { useModalDrag } from '../../hooks/useModalDrag';

import type { Sim3d } from '../../types/sim3d';

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

/**
 * Confirmation modal for floor plane alignment.
 * Shows: ✓ Apply | ↻ Re-detect | × Cancel
 */
export function FloorAlignModal() {
  const showFloorModal = useFloorPlaneStore((s) => s.showFloorModal);
  const modalPosition = useFloorPlaneStore((s) => s.modalPosition);
  const setShowFloorModal = useFloorPlaneStore((s) => s.setShowFloorModal);
  const detectedPlane = useFloorPlaneStore((s) => s.detectedPlane);
  const setDetectedPlane = useFloorPlaneStore((s) => s.setDetectedPlane);
  const normalFlipped = useFloorPlaneStore((s) => s.normalFlipped);
  const targetAxis = useFloorPlaneStore((s) => s.targetAxis);
  const distanceThreshold = useFloorPlaneStore((s) => s.distanceThreshold);
  const maxIterations = useFloorPlaneStore((s) => s.maxIterations);
  const sampleCount = useFloorPlaneStore((s) => s.sampleCount);
  const setPointDistances = useFloorPlaneStore((s) => s.setPointDistances);
  const setIsDetecting = useFloorPlaneStore((s) => s.setIsDetecting);
  const reset = useFloorPlaneStore((s) => s.reset);

  const transform = useTransformStore((s) => s.transform);
  const setTransform = useTransformStore((s) => s.setTransform);

  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);

  // Get target direction based on selected axis and coordinate system
  const targetUp = useMemo(() => {
    const system = COORDINATE_SYSTEMS[axesCoordinateSystem];
    const axisKey = targetAxis.toLowerCase() as 'x' | 'y' | 'z';
    const direction = system[axisKey];
    return new THREE.Vector3(direction[0], direction[1], direction[2]);
  }, [axesCoordinateSystem, targetAxis]);

  const { position, panelRef, handleDragStart } = useModalDrag({
    estimatedWidth: 120,
    estimatedHeight: 40,
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

      const plane = detectPlaneRANSAC(positions, { distanceThreshold, maxIterations, sampleCount });
      setDetectedPlane(plane);

      if (plane) {
        const distances = computeDistancesToPlane(positions, plane);
        setPointDistances(distances);
      } else {
        setPointDistances(null);
      }

      setIsDetecting(false);
    }, 10);
  }, [wasmReconstruction, distanceThreshold, maxIterations, sampleCount, transform, setDetectedPlane, setPointDistances, setIsDetecting]);

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
    setShowFloorModal(false);
    reset();
  }, [detectedPlane, normalFlipped, targetUp, transform, setTransform, setShowFloorModal, reset]);

  if (!showFloorModal || !detectedPlane) return null;

  return (
    <div
      ref={panelRef}
      className="fixed bg-ds-tertiary border border-ds rounded shadow-ds-lg p-1"
      style={{ left: position.x, top: position.y, zIndex: Z_INDEX.modalOverlay }}
      onPointerDown={handleDragStart}
    >
      <div className="flex items-center gap-0.5">
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
