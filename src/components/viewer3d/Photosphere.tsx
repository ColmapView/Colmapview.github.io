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
 * Equirectangular panorama sphere for spherical (360°) cameras.
 *
 * three.js SphereGeometry produces lon/lat UV mapping that directly accepts
 * equirectangular textures without additional UV transforms.
 *
 * The `quaternion` comes from the COLMAP camera pose so the "forward" direction
 * of the panorama aligns with the camera's local –Z axis.
 *
 * Orientation note: if the panorama appears rotated or flipped after Task 5
 * integration testing, apply a fixed correction here — either:
 *   - A quaternion offset on the mesh (pre-multiply `quaternion` with a correction)
 *   - `texture.offset.x = 0.5` to rotate 180° around the vertical axis
 *   - `texture.repeat.x = -1` + `texture.offset.x = 1` to flip horizontally
 * Keep the fix isolated in this component (not in the caller).
 */
export function Photosphere({
  position,
  quaternion,
  radius,
  texture,
  side = THREE.FrontSide,
}: PhotosphereProps) {
  return (
    <mesh position={position} quaternion={quaternion}>
      {/* Slightly inside (0.99) so the photosphere doesn't z-fight with outer cage geometry */}
      <sphereGeometry args={[radius * 0.99, 64, 32]} />
      <meshBasicMaterial
        map={texture}
        side={side}
        toneMapped={false}
      />
    </mesh>
  );
}
