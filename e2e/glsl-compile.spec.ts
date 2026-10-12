import { test, expect } from '@playwright/test';
import type { Texture } from 'three';
import type { Camera } from '../src/types/colmap';
import {
  undistortionVertexShader,
  undistortionFragmentShader,
  fullFrameVertexShader,
  fullFrameFragmentShader,
} from '../src/shaders/undistortion';

/**
 * Compiles + links the pinhole image-plane undistortion shaders in a real
 * WebGL1 context (ANGLE). The shader sources are plain strings, so neither tsc,
 * vite, nor the unit tests ever validate that they actually compile on a GPU.
 * ANGLE's translator is strict, so this catches GLSL ES 1.00 errors that
 * permissive drivers miss.
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

const prepVertex = (src: string) => VERTEX_BUILTINS + src;
// Strip the Three.js shader chunk so we validate only our own GLSL.
const prepFragment = (src: string) => src.replace('#include <colorspace_fragment>', '');

// These modules execute in Vite's browser context. Keep their small fixture
// contracts here so the Node test project does not compile the React app graph.
type BitmapCache = Map<string, { bitmap: ImageBitmap; lastUsed: number }>;
type TextureCache = Map<string, { texture: Texture; lastUsed: number }>;
interface BrowserFrustumGeometryModule {
  getFrustumPlaneSize(camera: Camera, scale: number): {
    width: number; height: number; depth: number; offsetX: number; offsetY: number;
  };
}
interface BrowserFrustumTextureModule {
  getOrLoadFrustumBitmap(url: string, name: string, cache: BitmapCache): Promise<ImageBitmap | null>;
  createFrustumTextureFromBitmap(bitmap: ImageBitmap, name: string, cache: TextureCache): Texture | null;
  clearActiveFrustumTextures(cache: TextureCache): void;
  clearFrustumBitmapCache(cache: BitmapCache): void;
}

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

test('ImageBitmap image planes sample calibrated COLMAP rays in every undistortion mode', async ({ page }, testInfo) => {
  await page.route('**/frustum-projection-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Frustum projection fixture</title>',
  }));
  await page.goto('/frustum-projection-fixture');

  // Reintroduce only the original Y formulas for independent negative controls.
  // These controls must be rejected by the same pixel oracle as the real code.
  const originalY = (source: string) => source
    .replaceAll('uv.y * imageHeight', '(1.0 - uv.y) * imageHeight')
    .replace('float v = py / imageHeight;', 'float v = 1.0 - (py / imageHeight);')
    .replace('float undistortedV = undistortedPy / imageHeight;', 'float undistortedV = 1.0 - (undistortedPy / imageHeight);');
  const shaders = {
    cropped: { vertex: undistortionVertexShader, fragment: undistortionFragmentShader },
    fullFrame: { vertex: fullFrameVertexShader, fragment: fullFrameFragmentShader },
  };
  const originalShaders = {
    cropped: { vertex: originalY(undistortionVertexShader), fragment: originalY(undistortionFragmentShader) },
    fullFrame: { vertex: originalY(fullFrameVertexShader), fragment: originalY(fullFrameFragmentShader) },
  };

  const results = await page.evaluate(async ({ shaders, originalShaders }) => {
    const threePath = '/node_modules/three/build/three.module.js';
    const geometryPath = '/src/components/viewer3d/cameraFrustumGeometry.ts';
    const texturePath = '/src/hooks/frustumTextureCache.ts';
    const intrinsicsPath = '/src/utils/cameraIntrinsics.ts';
    const THREE = await import(threePath) as typeof import('three');
    const { getFrustumPlaneSize } = await import(geometryPath) as BrowserFrustumGeometryModule;
    const { getOrLoadFrustumBitmap, createFrustumTextureFromBitmap, clearActiveFrustumTextures, clearFrustumBitmapCache } =
      await import(texturePath) as BrowserFrustumTextureModule;
    const { getCameraIntrinsics } = await import(intrinsicsPath) as typeof import('../src/utils/cameraIntrinsics');

    const width = 128;
    const height = 96;
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const context = source.getContext('2d')!;
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        image.data.set([2 * x, 2 * y, 80, 255], 4 * (y * width + x));
      }
    }
    context.putImageData(image, 0, 0);
    const blob = await new Promise<Blob>(resolve => source.toBlob(blob => resolve(blob!), 'image/png'));
    const url = URL.createObjectURL(blob);
    const bitmapCache: BitmapCache = new Map();
    const textureCache: TextureCache = new Map();
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const errors: string[] = [];
    renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
      errors.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n'));
    };

    try {
      // Exercise the real blob fetch, default (unflipped) bitmap creation, texture
      // construction and Three.js GPU upload; Texture.flipY cannot orient bitmaps.
      const bitmap = await getOrLoadFrustumBitmap(url, 'coordinate-grid.png', bitmapCache);
      if (!(bitmap instanceof ImageBitmap)) throw new Error('Frustum loader did not return an ImageBitmap');
      const texture = createFrustumTextureFromBitmap(bitmap, 'coordinate-grid.png', textureCache)!;
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;

      const fixtures = [
        { name: 'off-center pinhole', modelId: 1, fx: 110, fy: 105, cx: 51, cy: 72, k1: 0, k2: 0, p1: 0, p2: 0 },
        { name: 'centered pinhole', modelId: 1, fx: 110, fy: 110, cx: 64, cy: 48, k1: 0, k2: 0, p1: 0, p2: 0 },
        { name: 'zero radial distortion', modelId: 2, fx: 110, fy: 110, cx: 51, cy: 72, k1: 0, k2: 0, p1: 0, p2: 0 },
        { name: 'SIMPLE_RADIAL', modelId: 2, fx: 110, fy: 110, cx: 51, cy: 72, k1: -0.12, k2: 0, p1: 0, p2: 0 },
        { name: 'OPENCV tangential', modelId: 4, fx: 110, fy: 105, cx: 51, cy: 72, k1: -0.12, k2: 0.02, p1: 0.03, p2: -0.02 },
      ] as const;
      const variants = [
        { name: 'corrected', oldGeometry: false, oldShaders: false },
        { name: 'original geometry', oldGeometry: true, oldShaders: false },
        { name: 'original shaders', oldGeometry: false, oldShaders: true },
        { name: 'original geometry and shaders', oldGeometry: true, oldShaders: true },
      ];
      const modes = ['disabled', 'cropped', 'fullFrame'] as const;
      const output = [];

      for (const variant of variants) {
        for (const fixture of fixtures) {
          const camera = {
            cameraId: 1, modelId: fixture.modelId, width, height,
            params: fixture.modelId === 2
              ? [fixture.fx, fixture.cx, fixture.cy, fixture.k1]
              : [fixture.fx, fixture.fy, fixture.cx, fixture.cy, ...(fixture.modelId === 4
                ? [fixture.k1, fixture.k2, fixture.p1, fixture.p2] : [])],
          };
          const intrinsics = getCameraIntrinsics(camera);
          const planeSize = getFrustumPlaneSize(camera, 1);
          const view = new THREE.PerspectiveCamera();
          // Look from the calibrated camera center: COLMAP is +Z forward, +Y down.
          view.up.set(0, -1, 0);
          view.lookAt(0, 0, 1);
          const near = 0.1;
          view.projectionMatrix.makePerspective(
            -fixture.cx * near / fixture.fx, (width - fixture.cx) * near / fixture.fx,
            fixture.cy * near / fixture.fy, -(height - fixture.cy) * near / fixture.fy,
            near, 10,
          );
          view.projectionMatrixInverse.copy(view.projectionMatrix).invert();

          for (const mode of modes) {
            const programs = variant.oldShaders ? originalShaders : shaders;
            const uniforms = Object.fromEntries(Object.entries(intrinsics).map(([key, value]) => [key, { value }]));
            const material = mode === 'disabled'
              ? new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })
              : new THREE.ShaderMaterial({
                vertexShader: programs[mode].vertex,
                fragmentShader: programs[mode].fragment,
                uniforms: {
                  ...uniforms,
                  map: { value: texture }, opacity: { value: 1 }, color: { value: new THREE.Vector3(1, 1, 1) },
                  modelId: { value: fixture.modelId }, imageWidth: { value: width }, imageHeight: { value: height },
                  planeWidth: { value: planeSize.width }, planeHeight: { value: planeSize.height },
                  undistortionEnabled: { value: true },
                },
                side: THREE.DoubleSide, transparent: true, blending: THREE.NormalBlending,
                depthWrite: false, depthTest: false, toneMapped: false,
              });
            // Match FrustumPlaneSurface's tessellation and selected-plane blending.
            // Invalid full-frame rays emit alpha=0; they must not overwrite valid rays.
            const segments = mode === 'fullFrame' ? 32 : 1;
            const geometry = new THREE.PlaneGeometry(planeSize.width, planeSize.height, segments, segments);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(planeSize.offsetX, variant.oldGeometry ? -planeSize.offsetY : planeSize.offsetY, planeSize.depth);
            const scene = new THREE.Scene();
            scene.add(mesh);
            renderer.render(scene, view);
            const gl = renderer.getContext();
            const pixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

            let samples = 0;
            let maxError = 0;
            let mismatches = 0;
            for (let y = 8; y < height - 8; y += 7) {
              for (let x = 8; x < width - 8; x += 7) {
                // Independent COLMAP forward projection, never a shader UV mirror.
                // Full-frame inverse vertex warping and cropped forward sampling
                // must both land on this source pixel for the same viewing ray.
                const nx = (x + 0.5 - fixture.cx) / fixture.fx;
                const ny = (y + 0.5 - fixture.cy) / fixture.fy;
                const r2 = nx * nx + ny * ny;
                const radial = 1 + fixture.k1 * r2 + fixture.k2 * r2 * r2;
                const px = mode === 'disabled' ? x + 0.5 : fixture.fx * (
                  nx * radial + 2 * fixture.p1 * nx * ny + fixture.p2 * (r2 + 2 * nx * nx)
                ) + fixture.cx;
                const py = mode === 'disabled' ? y + 0.5 : fixture.fy * (
                  ny * radial + fixture.p1 * (r2 + 2 * ny * ny) + 2 * fixture.p2 * nx * ny
                ) + fixture.cy;
                if (px < 3 || px >= width - 3 || py < 3 || py >= height - 3) continue;
                const index = 4 * ((height - 1 - y) * width + x);
                const expected = [2 * Math.floor(px), 2 * Math.floor(py), 80];
                const error = Math.max(...expected.map((channel, c) => Math.abs(channel - pixels[index + c])));
                maxError = Math.max(maxError, error);
                if (error > 2) mismatches++;
                samples++;
              }
            }
            output.push({ variant: variant.name, camera: fixture.name, mode, samples, maxError, mismatches });
            geometry.dispose();
            material.dispose();
          }
        }
      }
      return { output, errors, bitmapWidth: bitmap.width, bitmapHeight: bitmap.height };
    } finally {
      clearActiveFrustumTextures(textureCache);
      clearFrustumBitmapCache(bitmapCache);
      renderer.dispose();
      URL.revokeObjectURL(url);
    }
  }, { shaders, originalShaders });

  await testInfo.attach('frustum-projection-pixels', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  expect(results.errors).toEqual([]);
  expect([results.bitmapWidth, results.bitmapHeight]).toEqual([128, 96]);
  for (const result of results.output.filter(result => result.variant === 'corrected')) {
    expect(result.samples).toBeGreaterThan(100);
    expect(result.maxError, `${result.camera}, ${result.mode}: ${result.mismatches} misaligned samples`).toBeLessThanOrEqual(2);
  }
  for (const variant of ['original geometry', 'original shaders', 'original geometry and shaders']) {
    for (const mode of ['cropped', 'fullFrame']) {
      expect(results.output.some(result => result.variant === variant && result.mode === mode && result.mismatches > 0),
        `${variant}, ${mode} must fail the pixel oracle`).toBe(true);
    }
  }
});
