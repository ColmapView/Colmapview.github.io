import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  computeSphericalBillboardLayout,
  createSphericalUndistortMaterial,
} from './sphericalUndistortion';

interface SphericalUndistortedViewProps {
  /** Sphere (camera) center, in the sim3d group's local space. */
  position: THREE.Vector3;
  /** COLMAP camera orientation (group space) — the frame the panorama is aligned to. */
  quaternion: THREE.Quaternion;
  /** Sphere radius (cameraScale). */
  radius: number;
  /**
   * Depth anchor L* (group space): the disk sits this far beyond the center C so
   * the observed 3D points overlay the imagery without drift. Computed by the
   * caller via computeMedianObservedPointDepth (already clamped to ≥ 2·radius).
   */
  anchorDepth: number;
  texture: THREE.Texture;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_X = new THREE.Vector3(1, 0, 0);

/**
 * Undistorted (perspective) view of the selected spherical camera — the (U)
 * undistortion mode for spherical cameras.
 *
 * A view-tracking billboard disk on the FAR side of the sphere center C,
 * cropped to the sphere's silhouette and placed at the depth anchor L*. Each
 * fragment shows the panorama color for the direction C→fragment (virtual
 * pinhole at the capture center), so points near L* overlay the 3D points from
 * any viewpoint without drifting as the view orbits. See sphericalUndistortion.ts
 * for the derivation and residual-error model.
 *
 * Everything is computed in the sim3d GROUP space (the mesh's parent):
 * `position`/`quaternion` are group-space, so the viewer position is pulled
 * into group space per frame; the capture center is pushed to WORLD space
 * (uCenterWorld) for the fragment ray. Hidden when the viewer is inside the sphere.
 */
export function SphericalUndistortedView({
  position,
  quaternion,
  radius,
  anchorDepth,
  texture,
}: SphericalUndistortedViewProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => new THREE.CircleGeometry(1, 64), []);
  const material = useMemo(() => createSphericalUndistortMaterial(texture), [texture]);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry]
  );
  useEffect(
    () => () => {
      material.dispose();
    },
    [material]
  );

  // Per-frame temporaries (no allocations inside useFrame).
  const tmp = useMemo(
    () => ({
      viewerWorld: new THREE.Vector3(),
      viewerGroup: new THREE.Vector3(),
      away: new THREE.Vector3(),
      up: new THREE.Vector3(),
      lookMatrix: new THREE.Matrix4(),
      parentQuat: new THREE.Quaternion(),
      camWorldQuat: new THREE.Quaternion(),
      rotMatrix4: new THREE.Matrix4(),
      centerWorld: new THREE.Vector3(),
    }),
    []
  );

  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    const parent = mesh?.parent;
    if (!mesh || !parent) return;

    // Refresh the parent's world matrix once so the layout (worldToLocal) and
    // the sampling frame (getWorldQuaternion) read the same-frame transform
    // during an active sim3d drag.
    parent.updateWorldMatrix(true, false);

    // Viewer position in the sim3d group's space (position/quaternion live there).
    camera.getWorldPosition(tmp.viewerWorld);
    tmp.viewerGroup.copy(tmp.viewerWorld);
    parent.worldToLocal(tmp.viewerGroup);

    const viewerDistance = tmp.viewerGroup.distanceTo(position);
    const layout = computeSphericalBillboardLayout(viewerDistance, radius, anchorDepth);
    if (!layout) {
      mesh.visible = false; // viewer inside the sphere — no silhouette to fill
      return;
    }
    mesh.visible = true;

    // Away-from-viewer axis; plane center = C + away * d (far side of the sphere,
    // at the depth anchor L* = layout.d).
    tmp.away.copy(position).sub(tmp.viewerGroup).normalize();
    mesh.position.copy(position).addScaledVector(tmp.away, layout.d);

    // Billboard: local +Z toward the viewer — purely cosmetic placement; the
    // sampled content is computed in WORLD space so it cannot depend on the
    // billboard's own orientation.
    tmp.up.copy(WORLD_UP);
    if (Math.abs(tmp.up.dot(tmp.away)) > 0.999) tmp.up.copy(WORLD_X);
    tmp.lookMatrix.lookAt(tmp.viewerGroup, mesh.position, tmp.up);
    mesh.quaternion.setFromRotationMatrix(tmp.lookMatrix);

    // World -> panorama-camera rotation. The panorama camera frame is EXACTLY
    // the frame the (validated) photosphere mesh renders in:
    // parentWorldQuat * frustum.quaternion. The fragment shader samples by the
    // CAPTURE-CENTER ray, so it also needs C in world space (uCenterWorld).
    parent.getWorldQuaternion(tmp.parentQuat);
    tmp.camWorldQuat.copy(tmp.parentQuat).multiply(quaternion).invert();
    tmp.rotMatrix4.makeRotationFromQuaternion(tmp.camWorldQuat);

    // Capture center C in world space: position is group-space, so push it out
    // through the (freshly updated) parent world matrix.
    tmp.centerWorld.copy(position);
    parent.localToWorld(tmp.centerWorld);

    const uniforms = (mesh.material as THREE.ShaderMaterial).uniforms;
    (uniforms.uCamRotInv.value as THREE.Matrix3).setFromMatrix4(tmp.rotMatrix4);
    (uniforms.uCenterWorld.value as THREE.Vector3).copy(tmp.centerWorld);
    uniforms.uS.value = layout.s;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      // Invisible until the first useFrame places/aims it (useFrame runs before
      // render, so no flash occurs — this just makes that guarantee explicit).
      visible={false}
      // The crop radius is applied in the vertex shader (uS), so the geometry's
      // unit bounding sphere is meaningless for culling.
      frustumCulled={false}
    />
  );
}
