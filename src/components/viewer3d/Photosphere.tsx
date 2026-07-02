import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

interface PhotosphereProps {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Radius of the sphere. Rendered at radius * 0.99 so it sits just inside any outer cage geometry. */
  radius: number;
  texture: THREE.Texture;
  /**
   * Which face(s) to render. Defaults to THREE.FrontSide which renders outward faces
   * (visible from OUTSIDE — current object view, default/correct).
   * Pass THREE.BackSide to render inner faces (visible from INSIDE — future immersive
   * "enter the sphere" mode). Use THREE.DoubleSide if both orientations are needed.
   */
  side?: THREE.Side;
}

/**
 * Unit sphere for equirectangular panoramas — STOCK three.js UV mapping.
 *
 * Orientation was verified against the labeled synthetic dataset AND a real
 * spherical SfM reconstruction (2026-07-02): with the COLMAP camera quaternion
 * applied, the stock mapping already aligns the panorama with the world
 * (pano sky toward world up, azimuth bands toward the matching points).
 *
 * DO NOT flip V here. That was tried and it inverted the true alignment
 * (pano sky ended up facing the floor points). The "upside down" impression
 * that motivated it came from the fly-to re-orienting the VIEWER to a wrong
 * world-up (COLMAP gravity is often +Y = three.js down) — fixed in
 * useTrackballFlyTo by preserving the viewer's current roll instead.
 *
 * Note on the outside view: a world-aligned panorama viewed from OUTSIDE a
 * FrontSide sphere necessarily reads mirrored (you are looking at the back of
 * the image). That is inherent, accepted by design (alignment-to-points wins);
 * the future inside/immersive view reads normally.
 */
export function createPhotosphereGeometry(): THREE.SphereGeometry {
  return new THREE.SphereGeometry(1, 64, 32);
}

/**
 * Equirectangular panorama sphere for spherical (360°) cameras.
 *
 * three.js SphereGeometry produces lon/lat UV mapping that directly accepts
 * equirectangular textures without additional UV transforms (see
 * createPhotosphereGeometry for the orientation verification history).
 *
 * The `quaternion` comes from the COLMAP camera pose so the panorama aligns
 * with the reconstruction. The texture must NOT be flipped/mutated: it is
 * shared with the pinhole image-plane previews via the frustum-texture cache.
 */
export function Photosphere({
  position,
  quaternion,
  radius,
  texture,
  side = THREE.FrontSide,
}: PhotosphereProps) {
  const geometry = useMemo(() => createPhotosphereGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Slightly inside (0.99) so the photosphere doesn't z-fight with outer cage geometry
  const scale = radius * 0.99;

  return (
    <mesh
      position={position}
      quaternion={quaternion}
      scale={[scale, scale, scale]}
      geometry={geometry}
    >
      <meshBasicMaterial map={texture} side={side} toneMapped={false} />
    </mesh>
  );
}
