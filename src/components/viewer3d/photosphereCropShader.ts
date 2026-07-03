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
