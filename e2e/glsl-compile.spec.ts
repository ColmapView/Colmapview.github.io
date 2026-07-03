import { test, expect } from '@playwright/test';
import {
  undistortionVertexShader,
  undistortionFragmentShader,
  fullFrameVertexShader,
  fullFrameFragmentShader,
} from '../src/shaders/undistortion';
import {
  SPHERICAL_UNDISTORT_VERTEX_SHADER,
  SPHERICAL_UNDISTORT_FRAGMENT_SHADER,
} from '../src/components/viewer3d/sphericalUndistortion';

/**
 * Compiles + links the undistortion shaders (pinhole image planes + the
 * spherical portal disk) in a real WebGL1 context (ANGLE). The shader sources
 * are plain strings, so neither tsc, vite, nor the unit tests ever validate
 * that they actually compile on a GPU. ANGLE's translator is strict, so this
 * catches GLSL ES 1.00 errors that permissive drivers miss.
 */

// Three.js injects these for ShaderMaterial (GLSL ES 1.00); declare the subset
// our vertex shaders use so the sources compile standalone.
const VERTEX_BUILTINS = `
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
attribute vec3 position;
attribute vec2 uv;
`;

// Three.js also injects these into fragment shaders; the spherical portal
// fragment samples by viewer ray (cameraPosition) and declares no precision
// of its own (three prepends the precision header at runtime).
const FRAGMENT_BUILTINS = `
precision highp float;
uniform vec3 cameraPosition;
`;

const prepVertex = (src: string) => VERTEX_BUILTINS + src;
// Strip the Three.js shader chunk so we validate only our own GLSL.
const prepFragment = (src: string) => src.replace('#include <colorspace_fragment>', '');

test('undistortion shaders compile and link in WebGL', async ({ page }) => {
  await page.goto('about:blank');

  const result = await page.evaluate(
    ({ programs }) => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl');
      if (!gl) return { ok: false as const, error: 'no webgl context' };

      const compile = (type: number, src: string) => {
        const sh = gl.createShader(type)!;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS) as boolean;
        return { ok, log: ok ? '' : gl.getShaderInfoLog(sh) || '', sh };
      };

      const out = programs.map((p) => {
        const vs = compile(gl.VERTEX_SHADER, p.vert);
        const fs = compile(gl.FRAGMENT_SHADER, p.frag);
        let linkOk = false;
        let linkLog = '';
        if (vs.ok && fs.ok) {
          const prog = gl.createProgram()!;
          gl.attachShader(prog, vs.sh);
          gl.attachShader(prog, fs.sh);
          gl.linkProgram(prog);
          linkOk = gl.getProgramParameter(prog, gl.LINK_STATUS) as boolean;
          linkLog = linkOk ? '' : gl.getProgramInfoLog(prog) || '';
        }
        return { name: p.name, vsOk: vs.ok, vsLog: vs.log, fsOk: fs.ok, fsLog: fs.log, linkOk, linkLog };
      });

      return { ok: true as const, out };
    },
    {
      programs: [
        { name: 'cropped', vert: prepVertex(undistortionVertexShader), frag: prepFragment(undistortionFragmentShader) },
        { name: 'fullFrame', vert: prepVertex(fullFrameVertexShader), frag: prepFragment(fullFrameFragmentShader) },
        {
          name: 'sphericalPortal',
          vert: prepVertex(SPHERICAL_UNDISTORT_VERTEX_SHADER),
          frag: FRAGMENT_BUILTINS + prepFragment(SPHERICAL_UNDISTORT_FRAGMENT_SHADER),
        },
      ],
    }
  );

  expect(result.ok, 'error' in result ? result.error : '').toBe(true);
  if (!result.ok) return;

  for (const r of result.out) {
    expect(r.vsOk, `${r.name} vertex shader: ${r.vsLog}`).toBe(true);
    expect(r.fsOk, `${r.name} fragment shader: ${r.fsLog}`).toBe(true);
    expect(r.linkOk, `${r.name} program link: ${r.linkLog}`).toBe(true);
  }
});
