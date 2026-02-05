/**
 * Modal for floor detection tool with RANSAC parameters.
 * Triggered from TransformPanel button.
 */

import { useState, useCallback, useEffect, useRef, memo, useMemo } from 'react';
import * as THREE from 'three';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  useReconstructionStore,
  useTransformStore,
  useUIStore,
} from '../../store';
import { useModalZIndex } from '../../hooks/useModalZIndex';
import { useFloorPlaneStore, type FloorColorMode } from '../../store/stores/floorPlaneStore';
import { detectPlaneRANSAC, computeDistancesToPlane, transformPositions, flipPlaneNormal } from '../../utils/ransac';
import { createSim3dFromEuler, isIdentityEuler, sim3dToEuler, composeSim3d } from '../../utils/sim3dTransforms';
import { COORDINATE_SYSTEMS } from '../../utils/coordinateSystems';
import { modalStyles, controlPanelStyles } from '../../theme';
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

// Slider row component (simplified version for modal)
interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}

const SliderRow = memo(function SliderRow({ label, value, min, max, step, onChange, formatValue }: SliderRowProps) {
  const decimals = step >= 1 ? 0 : step.toString().split('.')[1]?.length || 0;
  const displayValue = formatValue ? formatValue(value) : value.toFixed(decimals);
  const progress = ((value - min) / (max - min)) * 100;

  return (
    <div className={styles.row}>
      <label className={styles.label}>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={styles.slider}
        style={{ '--range-progress': `${progress}%` } as React.CSSProperties}
      />
      <span className={styles.value}>{displayValue}</span>
    </div>
  );
});

// Select row component (simplified version for modal)
interface SelectRowProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

const SelectRow = memo(function SelectRow({ label, value, onChange, options }: SelectRowProps) {
  return (
    <div className={styles.row}>
      <label className={styles.label}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.selectRight}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
});

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

  // Position and drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Z-index management for stacking multiple modals
  const { zIndex, bringToFront } = useModalZIndex(isOpen);

  // Center modal function
  const centerModal = useCallback(() => {
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      setPosition({
        x: (viewportW - rect.width) / 2,
        y: Math.max(20, (viewportH - rect.height) / 2),
      });
    }
  }, []);

  // Center modal when opened
  useEffect(() => {
    if (isOpen) {
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPosition({
        x: (viewportW - 280) / 2,
        y: Math.max(20, (viewportH - 300) / 2),
      });
      requestAnimationFrame(centerModal);
    }
  }, [isOpen, centerModal]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  }, [position]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: dragStart.current.posX + e.clientX - dragStart.current.x,
          y: dragStart.current.posY + e.clientY - dragStart.current.y,
        });
      }
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

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
        onMouseDown={bringToFront}
      >
        {/* Header */}
        <div
          className={modalStyles.toolHeader}
          onMouseDown={handleDragStart}
        >
          <span className={modalStyles.toolHeaderTitle}>Floor Detection</span>
          <button
            onClick={handleClose}
            onMouseDown={(e) => e.stopPropagation()}
            className={modalStyles.toolHeaderClose}
            title="Close"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
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
