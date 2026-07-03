import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createPhotosphereGeometry } from './photosphereGeometry';
import { getPhotosphereRenderConfig } from './photosphereRenderConfig';

interface PhotosphereProps {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Radius of the sphere. Rendered at radius * 0.99 so it sits just inside any outer cage geometry. */
  radius: number;
  texture: THREE.Texture;
  /**
   * Which face(s) to render. Defaults to THREE.FrontSide which renders outward faces
   * (visible from OUTSIDE — current object view, default/correct).
   * Pass THREE.BackSide to render inner faces (visible from INSIDE — the immersive
   * "enter the sphere" mode). Use THREE.DoubleSide if both orientations are needed.
   */
  side?: THREE.Side;
  /**
   * Render as a non-occluding background. When the viewer is INSIDE the sphere (U
   * undistortion enters the panorama), the photosphere must never hide the points or
   * scene: it draws first (renderOrder −1) and ignores depth (depthTest/depthWrite
   * off), so everything else composites over it. Off (default) keeps the opaque
   * depth-tested inspection sphere used from outside.
   */
  background?: boolean;
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
  background = false,
}: PhotosphereProps) {
  const geometry = useMemo(() => createPhotosphereGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Slightly inside (0.99) so the photosphere doesn't z-fight with outer cage geometry
  const scale = radius * 0.99;

  const { renderOrder, depthWrite, depthTest } = getPhotosphereRenderConfig(background);

  return (
    <mesh
      position={position}
      quaternion={quaternion}
      scale={[scale, scale, scale]}
      geometry={geometry}
      renderOrder={renderOrder}
    >
      <meshBasicMaterial
        map={texture}
        side={side}
        toneMapped={false}
        depthWrite={depthWrite}
        depthTest={depthTest}
      />
    </mesh>
  );
}
