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
  texture: THREE.Texture;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_X = new THREE.Vector3(1, 0, 0);

/**
 * Undistorted (perspective) view of the selected spherical camera — the (U)
 * undistortion mode for spherical cameras.
 *
 * A view-tracking billboard disk on the FAR side of the sphere center C,
 * cropped to the sphere's silhouette. Each fragment shows the panorama color
 * for the direction C→fragment (virtual pinhole at the capture center), so
 * the imagery aligns with the 3D points exactly through C and tracks the view
 * while orbiting. See sphericalUndistortion.ts for the derivation.
 *
 * Everything is computed in the sim3d GROUP space (the mesh's parent):
 * `position`/`quaternion` are group-space, so the viewer position is pulled
 * into group space per frame. Hidden when the viewer is inside the sphere.
 */
export function SphericalUndistortedView({
  position,
  quaternion,
  radius,
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
    }),
    []
  );

  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    const parent = mesh?.parent;
    if (!mesh || !parent) return;

    // Viewer position in the sim3d group's space (position/quaternion live there).
    camera.getWorldPosition(tmp.viewerWorld);
    tmp.viewerGroup.copy(tmp.viewerWorld);
    parent.worldToLocal(tmp.viewerGroup);

    const viewerDistance = tmp.viewerGroup.distanceTo(position);
    const layout = computeSphericalBillboardLayout(viewerDistance, radius);
    if (!layout) {
      mesh.visible = false; // viewer inside the sphere — no silhouette to fill
      return;
    }
    mesh.visible = true;

    // Away-from-viewer axis; plane center = C + away * d (far side of the sphere).
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
    // parentWorldQuat * frustum.quaternion. The fragment shader samples by
    // VIEWER ray (three's built-in cameraPosition), so no center uniform is
    // needed — the disk is just a cropped window into the panorama.
    parent.getWorldQuaternion(tmp.parentQuat);
    tmp.camWorldQuat.copy(tmp.parentQuat).multiply(quaternion).invert();
    tmp.rotMatrix4.makeRotationFromQuaternion(tmp.camWorldQuat);
    const uniforms = (mesh.material as THREE.ShaderMaterial).uniforms;
    (uniforms.uCamRotInv.value as THREE.Matrix3).setFromMatrix4(tmp.rotMatrix4);
    uniforms.uS.value = layout.s;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      // The crop radius is applied in the vertex shader (uS), so the geometry's
      // unit bounding sphere is meaningless for culling.
      frustumCulled={false}
    />
  );
}
