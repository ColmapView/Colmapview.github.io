/**
 * Shared types for point cloud hooks.
 */

import type * as THREE from 'three';
import type { Reconstruction } from '../../types/colmap';
import type { ColorMode } from '../../store/types';
import type { FloorColorMode } from '../../store/stores/floorPlaneStore';
import type { WasmReconstructionWrapper } from '../../wasm/reconstruction';

/**
 * Parameters for computing point cloud data (positions and colors).
 */
export interface PointCloudDataParams {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
  colorMode: ColorMode;
  minTrackLength: number;
  maxReprojectionError: number;
  selectedImageId: number | null;
  showSelectionHighlight: boolean;
  highlightColor: [number, number, number];
  floorColorMode: FloorColorMode;
  pointDistances: Float32Array | null;
  distanceThreshold: number;
}

/**
 * Result from point cloud data computation.
 */
export interface PointCloudDataResult {
  positions: Float32Array | null;
  colors: Float32Array | null;
  selectedPositions: Float32Array | null;
  selectedColors: Float32Array | null;
  indexToPoint3DId: Map<number, bigint>;
}

/**
 * Result from finding the nearest point via raycasting.
 */
export interface NearestPointResult {
  index: number;
  worldPos: THREE.Vector3;
}

/**
 * Selected point data for point picking.
 */
export interface SelectedPointData {
  position: THREE.Vector3;
  point3DId: bigint;
}

/**
 * Screen position for modal placement.
 */
export interface ScreenPosition {
  x: number;
  y: number;
}
