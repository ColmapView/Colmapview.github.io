import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createPhotosphereGeometry } from './photosphereGeometry';
import { getPhotosphereRenderConfig } from './photosphereRenderConfig';
import {
  createPhotosphereCropUniforms,
  getPanoramaLensOpacity,
  injectPhotosphereCropShader,
  isPointerInsideLens,
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
  /**
   * The user's Selection α setting — the same value the pinhole image planes use. In lens
   * mode the photo renders at this opacity, halved while the pointer hovers the circle
   * (identical rule to FrustumPlaneSurface). Ignored outside lens mode.
   */
  selectionPlaneOpacity?: number;
  /**
   * Written each frame with whether the pointer is inside the lens circle (only true when the
   * lens is actually active — eye inside the sphere). It is the gate for useSphericalLensFovWheel:
   * scroll INSIDE the circle changes fov in place, scroll OUTSIDE falls through to the dolly.
   */
  lensPointerStateRef?: MutableRefObject<{ pointerInsideLens: boolean }>;
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
  selectionPlaneOpacity = 1,
  lensPointerStateRef,
}: PhotosphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => createPhotosphereGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Slightly inside (0.99) so the photosphere doesn't z-fight with outer cage geometry
  const scale = radius * 0.99;

  // Initial flags assume the eye is inside (U flies to the center); the per-frame
  // inside-test below owns the truth and downgrades to the backdrop when the eye
  // zooms out of the sphere.
  const { renderOrder, depthWrite, depthTest, transparent } = getPhotosphereRenderConfig(
    background,
    true
  );

  // Crop-lens uniforms (see photosphereCropShader): one stable set of objects per
  // component instance (useMemo, like the tmp vectors below — NOT a ref written during
  // render, which react-hooks/refs forbids), wired into the material shader via
  // onBeforeCompile and mutated each frame. Seeded disabled; the useFrame below sets the
  // real value before the first render (frame callbacks run before gl.render). The shader
  // always carries the crop code; uCropEnabled gates it, so toggling background needs no
  // material recompile.
  const cropUniforms = useMemo(() => createPhotosphereCropUniforms(), []);
  // Ref bridge for the per-frame mutations: react-hooks/immutability allows writes only
  // through ref-derived bindings, and react-hooks/refs forbids writing a ref during
  // render — useRef(initialValue) with the memoized object satisfies both.
  const cropUniformsRef = useRef(cropUniforms);
  const handleBeforeCompile = useCallback(
    (shader: THREE.WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uCropEnabled = cropUniforms.uCropEnabled;
      shader.uniforms.uResolution = cropUniforms.uResolution;
      shader.uniforms.uCropRadiusFrac = cropUniforms.uCropRadiusFrac;
      shader.fragmentShader = injectPhotosphereCropShader(shader.fragmentShader);
    },
    [cropUniforms]
  );

  // Per-frame temporaries for the inside-the-sphere test (no allocations in useFrame).
  const tmp = useMemo(
    () => ({ center: new THREE.Vector3(), eye: new THREE.Vector3(), scale: new THREE.Vector3() }),
    []
  );

  // Each frame: feed the drawing-buffer size (DPR/resize-proof) and gate the lens on the
  // eye ACTUALLY being inside the sphere. U is a persistent toggle — zooming out while it
  // is on must fall back to the non-occluding backdrop instead of leaving a screen-locked
  // photo disk floating over the scene; zooming back in re-engages the lens.
  useFrame(({ gl, camera, pointer }) => {
    const uniforms = cropUniformsRef.current;
    uniforms.uResolution.value.set(gl.domElement.width, gl.domElement.height);

    const mesh = meshRef.current;
    if (!mesh) {
      uniforms.uCropEnabled.value = background ? 1 : 0;
      return;
    }

    mesh.getWorldPosition(tmp.center);
    camera.getWorldPosition(tmp.eye);
    const worldRadius = mesh.getWorldScale(tmp.scale).x; // unit sphere scaled by radius*0.99
    const insideSphere = tmp.eye.distanceTo(tmp.center) < worldRadius;
    const lensActive = background && insideSphere;

    uniforms.uCropEnabled.value = lensActive ? 1 : 0;

    const config = getPhotosphereRenderConfig(background, insideSphere);
    mesh.renderOrder = config.renderOrder;
    // In U (undistorted) mode the sphere is hidden whenever the eye is outside it, so a
    // right-click fly-to (camera outside the target sphere the whole flight) and a zoom-out
    // never flash the full uncropped panorama on the surface — only the circular crop shows,
    // only from inside. (The ref write and uniform updates below still run every frame.)
    mesh.visible = config.visible;
    const material = mesh.material as THREE.MeshBasicMaterial;
    if (material.transparent !== config.transparent) {
      material.transparent = config.transparent;
      // three bakes an OPAQUE define into programs compiled while the material is
      // opaque, hard-wiring output alpha to 1 — flipping `transparent` alone keeps
      // that program, so the hover opacity below would do nothing (the fade only
      // "came back" after something remounted the material). Recompile on the flip;
      // both program variants are cache hits after the first toggle each way.
      material.needsUpdate = true;
    }
    material.depthTest = config.depthTest;
    material.depthWrite = config.depthWrite;

    // Hover peek-through, same design as the pinhole image planes: the photo renders at
    // the user's Selection α, halved while the pointer hovers the lens circle (instant
    // switch, mirroring FrustumPlaneSurface). Outside lens mode the photo stays opaque.
    const hovered =
      lensActive
      && isPointerInsideLens(pointer.x, pointer.y, gl.domElement.width, gl.domElement.height);
    material.opacity = lensActive ? getPanoramaLensOpacity(hovered, selectionPlaneOpacity) : 1;

    // Publish the lens-hover state for the wheel handler's gate (a ref write in useFrame is
    // allowed — not render scope). `hovered` is already false whenever the lens is inactive,
    // so this is true ONLY inside the sphere AND inside the circle — exactly where scroll
    // should change fov instead of dollying (see useSphericalLensFovWheel).
    if (lensPointerStateRef) {
      lensPointerStateRef.current.pointerInsideLens = hovered;
    }
  });

  return (
    <mesh
      ref={meshRef}
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
