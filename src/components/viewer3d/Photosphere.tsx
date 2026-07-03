import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createPhotosphereGeometry } from './photosphereGeometry';
import { getPhotosphereRenderConfig } from './photosphereRenderConfig';
import {
  createPhotosphereCropUniforms,
  injectPhotosphereCropShader,
} from './photosphereCropShader';

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
   * Render as the viewport-centered circular ground-truth lens. When the viewer is INSIDE
   * the sphere (U undistortion enters the panorama) this is true: INSIDE a screen-space
   * circle the panorama photo is kept; OUTSIDE it the crop shader discards so the live
   * scene (splats / points) shows through — a direct ground-truth-vs-reconstruction seam
   * (see photosphereCropShader.ts and getPhotosphereRenderConfig). Off (default) keeps the
   * opaque depth-tested inspection sphere used from outside, with the lens shader gated off.
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

  const { renderOrder, depthWrite, depthTest, transparent } = getPhotosphereRenderConfig(background);

  // Crop-lens uniforms (see photosphereCropShader): stable objects wired into the material
  // shader once via onBeforeCompile, then mutated each frame. Held in a ref (the mutable
  // escape hatch) since useFrame writes them. The shader always carries the crop code;
  // uCropEnabled gates it, so toggling background needs no material recompile.
  const cropUniformsRef = useRef(createPhotosphereCropUniforms());
  const handleBeforeCompile = useCallback((shader: THREE.WebGLProgramParametersWithUniforms) => {
    const uniforms = cropUniformsRef.current;
    shader.uniforms.uCropEnabled = uniforms.uCropEnabled;
    shader.uniforms.uResolution = uniforms.uResolution;
    shader.uniforms.uCropRadiusFrac = uniforms.uCropRadiusFrac;
    shader.fragmentShader = injectPhotosphereCropShader(shader.fragmentShader);
  }, []);

  // Feed the crop toggle + drawing-buffer size (DPR/resize-proof) every frame.
  useFrame(({ gl }) => {
    const uniforms = cropUniformsRef.current;
    uniforms.uCropEnabled.value = background ? 1 : 0;
    uniforms.uResolution.value.set(gl.domElement.width, gl.domElement.height);
  });

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
        transparent={transparent}
        depthWrite={depthWrite}
        depthTest={depthTest}
        onBeforeCompile={handleBeforeCompile}
      />
    </mesh>
  );
}
