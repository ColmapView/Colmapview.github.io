import * as THREE from 'three';
import {
  getFrustumBaseColor,
  getFrustumMetricColorScale,
  type CameraFrustumItem,
  type FrustumColorMode,
  type FrustumPsnrMetricSource,
} from './cameraFrustumGeometry';
import type { ImageId } from '../../types/colmap';

/** Longitude arcs (pole-to-pole meridians). */
export const SPHERE_MERIDIANS = 8;
/** Latitude circles, excluding the poles. */
export const SPHERE_PARALLELS = 5;
/** Line segments approximating each circle/arc. */
export const SEGMENTS_PER_CIRCLE = 24;

export const SEGMENTS_PER_SPHERE = (SPHERE_MERIDIANS + SPHERE_PARALLELS) * SEGMENTS_PER_CIRCLE;
export const VERTS_PER_SPHERE = SEGMENTS_PER_SPHERE * 2;
export const FLOATS_PER_SPHERE = SEGMENTS_PER_SPHERE * 6;

// Local unit-sphere point: polar angle theta from +Y pole (0..PI), azimuth phi (0..2PI).
function unitSpherePoint(theta: number, phi: number, out: THREE.Vector3): THREE.Vector3 {
  const s = Math.sin(theta);
  return out.set(s * Math.cos(phi), Math.cos(theta), s * Math.sin(phi));
}

interface SphereGeometryOptions {
  frustumColorMode: FrustumColorMode;
  frustumSingleColor: string;
  imageFrameIndexMap: Map<ImageId, number>;
  splatPsnrByImage?: FrustumPsnrMetricSource;
}

export function buildSphereLineGeometryData(
  items: CameraFrustumItem[],
  cameraScale: number,
  { frustumColorMode, frustumSingleColor, imageFrameIndexMap, splatPsnrByImage }: SphereGeometryOptions
): { positions: Float32Array; baseColors: Float32Array; baseAlphas: Float32Array } {
  const positions = new Float32Array(items.length * FLOATS_PER_SPHERE);
  const baseColors = new Float32Array(items.length * FLOATS_PER_SPHERE);
  const baseAlphas = new Float32Array(items.length * VERTS_PER_SPHERE);
  const color = new THREE.Color();
  const metricColorScale = getFrustumMetricColorScale(
    frustumColorMode,
    items.map((item) => item.image.imageId),
    splatPsnrByImage
  );

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  items.forEach((item, index) => {
    const floatOffset = index * FLOATS_PER_SPHERE;
    const vertOffset = index * VERTS_PER_SPHERE;
    let seg = 0; // segment counter within this sphere

    const writeSegment = (p0: THREE.Vector3, p1: THREE.Vector3) => {
      const o = floatOffset + seg * 6;
      p0.multiplyScalar(cameraScale).applyQuaternion(item.quaternion).add(item.position);
      p1.multiplyScalar(cameraScale).applyQuaternion(item.quaternion).add(item.position);
      positions[o] = p0.x; positions[o + 1] = p0.y; positions[o + 2] = p0.z;
      positions[o + 3] = p1.x; positions[o + 4] = p1.y; positions[o + 5] = p1.z;
      seg++;
    };

    // Meridians: constant phi, theta 0..PI (pole to pole).
    for (let m = 0; m < SPHERE_MERIDIANS; m++) {
      const phi = (m / SPHERE_MERIDIANS) * Math.PI * 2;
      for (let s = 0; s < SEGMENTS_PER_CIRCLE; s++) {
        const t0 = (s / SEGMENTS_PER_CIRCLE) * Math.PI;
        const t1 = ((s + 1) / SEGMENTS_PER_CIRCLE) * Math.PI;
        writeSegment(unitSpherePoint(t0, phi, a), unitSpherePoint(t1, phi, b));
      }
    }
    // Parallels: constant theta, phi 0..2PI (latitude circles, excluding poles).
    for (let p = 0; p < SPHERE_PARALLELS; p++) {
      const theta = ((p + 1) / (SPHERE_PARALLELS + 1)) * Math.PI;
      for (let s = 0; s < SEGMENTS_PER_CIRCLE; s++) {
        const p0 = (s / SEGMENTS_PER_CIRCLE) * Math.PI * 2;
        const p1 = ((s + 1) / SEGMENTS_PER_CIRCLE) * Math.PI * 2;
        writeSegment(unitSpherePoint(theta, p0, a), unitSpherePoint(theta, p1, b));
      }
    }

    color.set(getFrustumBaseColor(
      frustumColorMode, item.cameraIndex, item.image.imageId,
      imageFrameIndexMap, frustumSingleColor, splatPsnrByImage, metricColorScale
    ));
    for (let v = 0; v < VERTS_PER_SPHERE; v++) {
      baseColors[floatOffset + v * 3] = color.r;
      baseColors[floatOffset + v * 3 + 1] = color.g;
      baseColors[floatOffset + v * 3 + 2] = color.b;
      // Placeholder: build-time alpha is 1.0, exactly as the pinhole
      // buildFrustumLineGeometryData does. SphericalCameraLines overwrites this
      // per-camera via writeSphereLineAlphas once the selection state is known.
      baseAlphas[vertOffset + v] = 1.0;
    }
  });

  return { positions, baseColors, baseAlphas };
}

export interface SphereLineAlphaOptions {
  isSelected: boolean;
  hasSelectedImage: boolean;
  frustumStandbyOpacity: number;
  unselectedCameraOpacity: number;
}

/**
 * Per-camera grid-line alpha, mirroring the pinhole frustum-line opacity
 * semantics in getFrustumLineStyle (cameraFrustumStylePolicy.ts) for the states
 * the v1 spherical renderer supports:
 *   - no selection active      -> frustumStandbyOpacity
 *   - selection, unselected     -> unselectedCameraOpacity
 *   - selection, this selected  -> 1.0 (the pinhole-equivalent selected value,
 *                                  i.e. the pre-override selected opacity; the
 *                                  pinhole `isSelected -> 0` override is the
 *                                  image-plane swap and is intentionally not
 *                                  mirrored here).
 * Hover / matches / pending-deletion are not tracked by the spherical v1
 * renderer, so those pinhole branches are intentionally omitted.
 */
export function getSphereLineAlpha({
  isSelected,
  hasSelectedImage,
  frustumStandbyOpacity,
  unselectedCameraOpacity,
}: SphereLineAlphaOptions): number {
  if (!hasSelectedImage) return frustumStandbyOpacity;
  if (isSelected) return 1.0;
  return unselectedCameraOpacity;
}

/**
 * Fill a fat-line alpha attribute array (VERTS_PER_SPHERE entries per camera,
 * laid out in the same order as buildSphereLineGeometryData) with the
 * per-camera opacity from getSphereLineAlpha. Mutates `target` in place.
 */
export function writeSphereLineAlphas(
  target: Float32Array,
  items: CameraFrustumItem[],
  selectedImageId: ImageId | null,
  frustumStandbyOpacity: number,
  unselectedCameraOpacity: number
): void {
  const hasSelectedImage = selectedImageId !== null;
  items.forEach((item, index) => {
    const alpha = getSphereLineAlpha({
      isSelected: item.image.imageId === selectedImageId,
      hasSelectedImage,
      frustumStandbyOpacity,
      unselectedCameraOpacity,
    });
    const vertOffset = index * VERTS_PER_SPHERE;
    for (let v = 0; v < VERTS_PER_SPHERE; v++) {
      target[vertOffset + v] = alpha;
    }
  });
}
