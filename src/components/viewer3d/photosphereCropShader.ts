import * as THREE from 'three';

/**
 * Viewport-centered circular "ground-truth lens" for the panorama photosphere.
 *
 * When U (spherical undistortion) flies the eye INSIDE the photosphere, the sphere renders
 * as a background (see getPhotosphereRenderConfig). This shader patch turns that background
 * into a comparison lens: INSIDE a viewport-centered circle the panorama photo is kept;
 * OUTSIDE the circle fragments are `discard`ed so the live scene (gaussian splats / points)
 * shows through. The circle boundary is thus a direct ground-truth-vs-reconstruction seam.
 *
 * Implemented as an `onBeforeCompile` patch of the photosphere's meshBasicMaterial (rather
 * than a full custom ShaderMaterial) so three's color-space / tone-mapping handling stays
 * intact — the panorama must keep matching the flat pinhole previews' colors. Screen-space
 * math uses `gl_FragCoord` (drawing-buffer px) against `uResolution`, so it is DPR- and
 * resize-correct as long as `uResolution` is fed the drawing-buffer size each frame.
 *
 * v1 has no UI: `PANORAMA_CROP_RADIUS_FRACTION` is the single tuning knob. A future
 * follow-up could expose the radius as a hotkey/slider — `uCropRadiusFrac` is already a
 * uniform, so only the wiring would be new.
 */

/** Circle radius as a fraction of `min(drawingBufferWidth, drawingBufferHeight)`. */
export const PANORAMA_CROP_RADIUS_FRACTION = 0.35;

/** Width of the dark boundary rim, in device (drawing-buffer) pixels. */
export const PANORAMA_CROP_RIM_DEVICE_PX = 1.5;

/**
 * Fragment-shader anchors we patch. Present in three r182's MeshBasicMaterial template
 * (`THREE.ShaderLib.basic.fragmentShader`); photosphereCropShader.test.ts pins that they
 * exist so a three upgrade that renames them fails loudly instead of silently no-op'ing.
 */
const MAIN_ANCHOR = 'void main() {';
const OUTPUT_TAIL_ANCHOR = '#include <dithering_fragment>';

const RIM_PX = PANORAMA_CROP_RIM_DEVICE_PX.toFixed(1);

/** Uniform declarations, prepended to the fragment shader. */
export const PHOTOSPHERE_CROP_UNIFORMS_GLSL = `
uniform float uCropEnabled;
uniform vec2 uResolution;
uniform float uCropRadiusFrac;
`;

/**
 * Early discard at main() start: drop fragments OUTSIDE the viewport-centered circle so the
 * live scene shows through there (and the texture fetch is skipped for discarded pixels).
 */
export const PHOTOSPHERE_CROP_DISCARD_GLSL = `
  // Panorama crop lens: drop fragments OUTSIDE the viewport-centered circle.
  if ( uCropEnabled > 0.5 ) {
    vec2 cropCenter = uResolution * 0.5;
    float cropRadius = uCropRadiusFrac * min( uResolution.x, uResolution.y );
    float cropDist = length( gl_FragCoord.xy - cropCenter );
    if ( cropDist > cropRadius ) discard;
  }
`;

/**
 * Late rim after three's output tail (tone-map + color-space + dither already applied):
 * a subtle dark ring within `PANORAMA_CROP_RIM_DEVICE_PX` of the boundary so the lens edge
 * reads. Mixing toward black in output space is correct in any color space.
 */
export const PHOTOSPHERE_CROP_RIM_GLSL = `
  // Panorama crop lens: subtle dark rim within ${RIM_PX} device px of the boundary.
  if ( uCropEnabled > 0.5 ) {
    vec2 cropCenter = uResolution * 0.5;
    float cropRadius = uCropRadiusFrac * min( uResolution.x, uResolution.y );
    float cropDist = length( gl_FragCoord.xy - cropCenter );
    float cropRim = smoothstep( cropRadius - ${RIM_PX}, cropRadius, cropDist );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( 0.0 ), cropRim );
  }
`;

/**
 * Patch a MeshBasicMaterial fragment shader (as received in `onBeforeCompile`, with the
 * `#include <...>` tokens still unresolved) to add the crop uniforms + discard + rim.
 */
export function injectPhotosphereCropShader(fragmentShader: string): string {
  return `${PHOTOSPHERE_CROP_UNIFORMS_GLSL}${fragmentShader}`
    .replace(MAIN_ANCHOR, `${MAIN_ANCHOR}\n${PHOTOSPHERE_CROP_DISCARD_GLSL}`)
    .replace(OUTPUT_TAIL_ANCHOR, `${OUTPUT_TAIL_ANCHOR}\n${PHOTOSPHERE_CROP_RIM_GLSL}`);
}

export interface PhotosphereCropUniforms {
  /** 1 while the crop lens is active (viewer inside / background mode), else 0. */
  uCropEnabled: { value: number };
  /** Drawing-buffer resolution in px, matching `gl_FragCoord` units. */
  uResolution: { value: THREE.Vector2 };
  /** Circle radius fraction of `min(width, height)`. */
  uCropRadiusFrac: { value: number };
}

/**
 * Create the stable uniform objects wired into the material via `onBeforeCompile`. Seeded
 * disabled with a unit resolution; the component feeds real values each frame.
 */
export function createPhotosphereCropUniforms(): PhotosphereCropUniforms {
  return {
    uCropEnabled: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCropRadiusFrac: { value: PANORAMA_CROP_RADIUS_FRACTION },
  };
}

/**
 * Hover halves the configured plane opacity — the SAME design as the pinhole image
 * planes (FrustumPlaneSurface.tsx: `isTransparent ? selectionPlaneOpacity * 0.5 :
 * selectionPlaneOpacity`), so hovering the panorama lens feels identical to hovering
 * a regular camera's image plane.
 */
export const LENS_HOVER_OPACITY_FACTOR = 0.5;

/**
 * Photo opacity for the panorama lens, mirroring the pinhole image-plane rule:
 * the user's Selection α setting, halved while the pointer hovers the lens.
 */
export function getPanoramaLensOpacity(hovered: boolean, selectionPlaneOpacity: number): number {
  return hovered ? selectionPlaneOpacity * LENS_HOVER_OPACITY_FACTOR : selectionPlaneOpacity;
}

/**
 * Whether the pointer is inside the lens circle — hovering the photo fades it so the
 * reconstruction shows through. MUST mirror PHOTOSPHERE_CROP_DISCARD_GLSL's circle:
 * center = resolution/2, radius = radiusFrac·min(resolution). `pointerNdc*` are the
 * three/R3F normalized pointer coords (-1..1); `resolution*` is the drawing buffer in
 * device px (same units as gl_FragCoord), so DPR cancels out of the comparison. The
 * circle is centered, so the NDC-vs-gl_FragCoord y-direction difference is irrelevant.
 */
export function isPointerInsideLens(
  pointerNdcX: number,
  pointerNdcY: number,
  resolutionX: number,
  resolutionY: number,
  radiusFrac: number = PANORAMA_CROP_RADIUS_FRACTION
): boolean {
  const px = (pointerNdcX * 0.5 + 0.5) * resolutionX;
  const py = (pointerNdcY * 0.5 + 0.5) * resolutionY;
  const dx = px - resolutionX * 0.5;
  const dy = py - resolutionY * 0.5;
  const radius = radiusFrac * Math.min(resolutionX, resolutionY);
  return dx * dx + dy * dy <= radius * radius;
}
