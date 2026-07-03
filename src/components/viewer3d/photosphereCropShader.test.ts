import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PANORAMA_CROP_RADIUS_FRACTION,
  PANORAMA_CROP_RIM_DEVICE_PX,
  PHOTOSPHERE_CROP_DISCARD_GLSL,
  PHOTOSPHERE_CROP_RIM_GLSL,
  PHOTOSPHERE_CROP_UNIFORMS_GLSL,
  createPhotosphereCropUniforms,
  injectPhotosphereCropShader,
} from './photosphereCropShader';

/**
 * Structural pins for the panorama crop-lens shader patch. jsdom cannot compile GLSL,
 * so — like originGridMaterial.test.ts and the equirect pins — we pin the injected
 * source strings and the injection against the REAL three MeshBasicMaterial template
 * (THREE.ShaderLib.basic, available without a WebGL context). The radius formula is
 * load-bearing (it is the sole tuning knob's usage) — do not "simplify" it.
 */
describe('photosphere crop shader tuning knobs', () => {
  it('pins the single radius fraction knob and the rim width', () => {
    expect(PANORAMA_CROP_RADIUS_FRACTION).toBe(0.35);
    expect(PANORAMA_CROP_RIM_DEVICE_PX).toBe(1.5);
  });
});

describe('injected crop GLSL', () => {
  it('declares the three viewport-crop uniforms', () => {
    expect(PHOTOSPHERE_CROP_UNIFORMS_GLSL).toContain('uniform float uCropEnabled;');
    expect(PHOTOSPHERE_CROP_UNIFORMS_GLSL).toContain('uniform vec2 uResolution;');
    expect(PHOTOSPHERE_CROP_UNIFORMS_GLSL).toContain('uniform float uCropRadiusFrac;');
  });

  it('discards fragments outside the viewport-centered circle using the pinned radius formula', () => {
    expect(PHOTOSPHERE_CROP_DISCARD_GLSL).toContain('uCropEnabled > 0.5');
    expect(PHOTOSPHERE_CROP_DISCARD_GLSL).toContain('vec2 cropCenter = uResolution * 0.5;');
    expect(PHOTOSPHERE_CROP_DISCARD_GLSL).toContain(
      'float cropRadius = uCropRadiusFrac * min( uResolution.x, uResolution.y );'
    );
    expect(PHOTOSPHERE_CROP_DISCARD_GLSL).toContain('length( gl_FragCoord.xy - cropCenter )');
    expect(PHOTOSPHERE_CROP_DISCARD_GLSL).toContain('if ( cropDist > cropRadius ) discard;');
  });

  it('draws a smoothstep dark rim within the pinned device-pixel band at the boundary', () => {
    expect(PHOTOSPHERE_CROP_RIM_GLSL).toContain('uCropEnabled > 0.5');
    expect(PHOTOSPHERE_CROP_RIM_GLSL).toContain(
      'smoothstep( cropRadius - 1.5, cropRadius, cropDist )'
    );
    expect(PHOTOSPHERE_CROP_RIM_GLSL).toContain(
      'gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( 0.0 ), cropRim );'
    );
  });
});

describe('injectPhotosphereCropShader', () => {
  const patched = injectPhotosphereCropShader(THREE.ShaderLib.basic.fragmentShader);

  it('keeps the meshBasicMaterial anchors it patches (guards against three upgrades)', () => {
    expect(THREE.ShaderLib.basic.fragmentShader).toContain('void main() {');
    expect(THREE.ShaderLib.basic.fragmentShader).toContain('#include <dithering_fragment>');
  });

  it('injects the uniforms, the early discard, and the late rim into the real basic shader', () => {
    expect(patched).toContain('uniform float uCropRadiusFrac;');
    expect(patched).toContain('if ( cropDist > cropRadius ) discard;');
    expect(patched).toContain('smoothstep( cropRadius - 1.5, cropRadius, cropDist )');
  });

  it('places the discard at main() start and the rim after three\'s color/dither output tail', () => {
    // discard is injected right after `void main() {`; the rim follows the last output
    // include, so gl_FragColor is already tone-mapped/color-managed when we tint the rim.
    expect(patched.indexOf('discard;')).toBeLessThan(patched.indexOf('cropRim'));
    expect(patched.indexOf('#include <dithering_fragment>')).toBeLessThan(
      patched.indexOf('cropRim')
    );
  });
});

describe('createPhotosphereCropUniforms', () => {
  it('seeds the radius knob and a disabled, unit resolution', () => {
    const uniforms = createPhotosphereCropUniforms();
    expect(uniforms.uCropEnabled.value).toBe(0);
    expect(uniforms.uCropRadiusFrac.value).toBe(PANORAMA_CROP_RADIUS_FRACTION);
    expect(uniforms.uResolution.value).toBeInstanceOf(THREE.Vector2);
  });
});
