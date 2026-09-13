import { describe, expect, it, vi } from 'vitest';
import { WebGLAttributes } from 'three/src/renderers/webgl/WebGLAttributes.js';
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


describe('fat line upload ranges', () => {
  const create = () => createFatLineSegmentsObject({ positions: new Float32Array(96), colors: new Float32Array(96), alphas: new Float32Array(32), lineWidth: 1 });
  it('uploads shared endpoint buffers once and clears initial ranges before partial uploads', () => {
    const lines = create();
    const colorStart = lines.geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute;
    const colorEnd = lines.geometry.getAttribute('instanceColorEnd') as THREE.InterleavedBufferAttribute;
    const alphaStart = lines.geometry.getAttribute('instanceAlphaStart') as THREE.InterleavedBufferAttribute;
    const alphaEnd = lines.geometry.getAttribute('instanceAlphaEnd') as THREE.InterleavedBufferAttribute;
    expect(colorStart.data).toBe(colorEnd.data);
    expect(alphaStart.data).toBe(alphaEnd.data);
    const gl = { ARRAY_BUFFER: 34962, FLOAT: 5126, createBuffer: vi.fn(() => ({})), bindBuffer: vi.fn(), bufferData: vi.fn(), bufferSubData: vi.fn() };
    const uploads = new WebGLAttributes(gl as unknown as WebGL2RenderingContext);
    markFatLineColorsNeedUpdate(lines.geometry);
    markFatLineAlphasNeedUpdate(lines.geometry);
    for (const attribute of [colorStart, colorEnd, alphaStart, alphaEnd]) uploads.update(attribute, gl.ARRAY_BUFFER);
    expect(gl.bufferData).toHaveBeenCalledTimes(2);
    expect(colorStart.data.updateRanges).toEqual([]);
    expect(alphaStart.data.updateRanges).toEqual([]);
    markFatLineColorsNeedUpdate(lines.geometry, [{ start: 48, count: 48 }]);
    markFatLineAlphasNeedUpdate(lines.geometry, [{ start: 16, count: 16 }]);
    for (const attribute of [colorStart, colorEnd, alphaStart, alphaEnd]) uploads.update(attribute, gl.ARRAY_BUFFER);
    expect(gl.bufferSubData.mock.calls).toEqual([
      [gl.ARRAY_BUFFER, 48 * 4, colorStart.data.array, 48, 48],
      [gl.ARRAY_BUFFER, 16 * 4, alphaStart.data.array, 16, 16],
    ]);
    expect(colorStart.data.updateRanges).toEqual([]);
    expect(alphaStart.data.updateRanges).toEqual([]);
    disposeFatLineSegmentsObject(lines);
  });

  it('unions partial writes across skipped uploads and cannot narrow a pending full write', () => {
    const lines = create();
    const buffer = (lines.geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute).data;
    markFatLineColorsNeedUpdate(lines.geometry, [{ start: 0, count: 6 }]);
    markFatLineColorsNeedUpdate(lines.geometry, [{ start: 12, count: 6 }]);
    expect(buffer.updateRanges).toEqual([{ start: 0, count: 6 }, { start: 12, count: 6 }]);
    markFatLineColorsNeedUpdate(lines.geometry, [{ start: 6, count: 6 }, { start: 12, count: 6 }]);
    expect(buffer.updateRanges).toEqual([{ start: 0, count: 18 }]);
    markFatLineColorsNeedUpdate(lines.geometry);
    markFatLineColorsNeedUpdate(lines.geometry, [{ start: 48, count: 48 }]);
    expect(buffer.updateRanges).toEqual([{ start: 0, count: 96 }]);
    buffer.onUploadCallback();
    markFatLineColorsNeedUpdate(lines.geometry, [{ start: 48, count: 48 }]);
    expect(buffer.updateRanges).toEqual([{ start: 48, count: 48 }]);
    const version = buffer.version;
    markFatLineColorsNeedUpdate(lines.geometry, []);
    expect(buffer.version).toBe(version);
    disposeFatLineSegmentsObject(lines);
  });

  it('preserves a previous upload callback and future ranges it adds', () => {
    const lines = create();
    const buffer = (lines.geometry.getAttribute('instanceAlphaStart') as THREE.InterleavedBufferAttribute).data;
    const previous = vi.fn(function (this: THREE.InterleavedBuffer) { this.addUpdateRange(2, 2); });
    buffer.onUpload(previous);
    markFatLineAlphasNeedUpdate(lines.geometry);
    markFatLineAlphasNeedUpdate(lines.geometry, [{ start: 0, count: 2 }]);
    buffer.onUploadCallback();
    expect(previous).toHaveBeenCalledOnce();
    expect(previous.mock.contexts[0]).toBe(buffer);
    expect(buffer.updateRanges).toEqual([{ start: 2, count: 2 }]);
    disposeFatLineSegmentsObject(lines);
  });
});
