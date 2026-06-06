import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createFatLineSegmentsObject,
  disposeFatLineSegmentsObject,
  getFatLineAlphaArray,
  getFatLineColorArray,
  markFatLineAlphasNeedUpdate,
  markFatLineColorsNeedUpdate,
} from './fatLineSegments';

describe('fat line segments', () => {
  it('creates mutable wide line segments with color and alpha buffers', () => {
    const fatLines = createFatLineSegmentsObject({
      positions: new Float32Array([0, 0, 0, 1, 0, 0]),
      colors: new Float32Array([1, 0, 0, 0, 1, 0]),
      alphas: new Float32Array([0.25, 0.75]),
      lineWidth: 4,
      opacity: 0.5,
      renderOrder: 7,
    });

    expect(fatLines.object.isLineSegments2).toBe(true);
    expect(fatLines.object.renderOrder).toBe(7);
    expect(fatLines.material.linewidth).toBe(4);
    expect(fatLines.material.opacity).toBe(0.5);
    expect(Array.from(getFatLineColorArray(fatLines.geometry) ?? [])).toEqual([1, 0, 0, 0, 1, 0]);
    expect(Array.from(getFatLineAlphaArray(fatLines.geometry) ?? [])).toEqual([0.25, 0.75]);

    const colorAttribute = fatLines.geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute;
    const alphaAttribute = fatLines.geometry.getAttribute('instanceAlphaStart') as THREE.InterleavedBufferAttribute;
    const colorVersion = colorAttribute.data.version;
    const alphaVersion = alphaAttribute.data.version;

    markFatLineColorsNeedUpdate(fatLines.geometry);
    markFatLineAlphasNeedUpdate(fatLines.geometry);

    expect(colorAttribute.data.version).toBe(colorVersion + 1);
    expect(alphaAttribute.data.version).toBe(alphaVersion + 1);

    disposeFatLineSegmentsObject(fatLines);
  });

  it('patches line material shaders to multiply opacity by per-endpoint alpha', () => {
    const fatLines = createFatLineSegmentsObject({
      positions: new Float32Array([0, 0, 0, 1, 0, 0]),
      alphas: new Float32Array([0.25, 0.75]),
      lineWidth: 2,
    });
    const shader = {
      vertexShader: 'attribute vec3 instanceColorEnd;\nvoid main() {',
      fragmentShader: '#include <clipping_planes_pars_fragment>\nfloat alpha = opacity;',
      uniforms: {},
    } as THREE.Shader;

    fatLines.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(shader.vertexShader).toContain('attribute float instanceAlphaStart;');
    expect(shader.vertexShader).toContain('vLineAlpha = ( position.y < 0.5 ) ? instanceAlphaStart : instanceAlphaEnd;');
    expect(shader.fragmentShader).toContain('varying float vLineAlpha;');
    expect(shader.fragmentShader).toContain('float alpha = opacity * vLineAlpha;');

    disposeFatLineSegmentsObject(fatLines);
  });
});
