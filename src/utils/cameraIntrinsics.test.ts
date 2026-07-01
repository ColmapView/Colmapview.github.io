import { describe, it, expect } from 'vitest';
import { getCameraIntrinsics } from './cameraIntrinsics';
import { buildCamera } from '../test/builders/colmapBuilders';
import { CameraModelId } from '../types/colmap';
import type { CameraIntrinsics } from '../types/colmap';

describe('getCameraIntrinsics parity (existing models 0-10)', () => {
  const parityCases: Array<{ name: string; modelId: number; params: number[]; expected: Partial<CameraIntrinsics> }> = [
    { name: 'SIMPLE_PINHOLE', modelId: CameraModelId.SIMPLE_PINHOLE, params: [100, 50, 60], expected: { fx: 100, fy: 100, cx: 50, cy: 60 } },
    { name: 'PINHOLE', modelId: CameraModelId.PINHOLE, params: [100, 110, 50, 60], expected: { fx: 100, fy: 110, cx: 50, cy: 60 } },
    { name: 'SIMPLE_RADIAL', modelId: CameraModelId.SIMPLE_RADIAL, params: [100, 50, 60, 0.1], expected: { fx: 100, fy: 100, cx: 50, cy: 60, k1: 0.1 } },
    { name: 'RADIAL', modelId: CameraModelId.RADIAL, params: [100, 50, 60, 0.1, 0.2], expected: { fx: 100, fy: 100, cx: 50, cy: 60, k1: 0.1, k2: 0.2 } },
    { name: 'OPENCV', modelId: CameraModelId.OPENCV, params: [100, 110, 50, 60, 0.1, 0.2, 0.3, 0.4], expected: { fx: 100, fy: 110, cx: 50, cy: 60, k1: 0.1, k2: 0.2, p1: 0.3, p2: 0.4 } },
    { name: 'OPENCV_FISHEYE', modelId: CameraModelId.OPENCV_FISHEYE, params: [100, 110, 50, 60, 0.1, 0.2, 0.3, 0.4], expected: { fx: 100, fy: 110, cx: 50, cy: 60, k1: 0.1, k2: 0.2, k3: 0.3, k4: 0.4 } },
    { name: 'FULL_OPENCV', modelId: CameraModelId.FULL_OPENCV, params: [100, 110, 50, 60, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], expected: { fx: 100, fy: 110, cx: 50, cy: 60, k1: 0.1, k2: 0.2, p1: 0.3, p2: 0.4, k3: 0.5, k4: 0.6, k5: 0.7, k6: 0.8 } },
    { name: 'FOV', modelId: CameraModelId.FOV, params: [100, 110, 50, 60, 0.9], expected: { fx: 100, fy: 110, cx: 50, cy: 60, omega: 0.9 } },
    { name: 'SIMPLE_RADIAL_FISHEYE', modelId: CameraModelId.SIMPLE_RADIAL_FISHEYE, params: [100, 50, 60, 0.1], expected: { fx: 100, fy: 100, cx: 50, cy: 60, k1: 0.1 } },
    { name: 'RADIAL_FISHEYE', modelId: CameraModelId.RADIAL_FISHEYE, params: [100, 50, 60, 0.1, 0.2], expected: { fx: 100, fy: 100, cx: 50, cy: 60, k1: 0.1, k2: 0.2 } },
    { name: 'THIN_PRISM_FISHEYE', modelId: CameraModelId.THIN_PRISM_FISHEYE, params: [100, 110, 50, 60, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], expected: { fx: 100, fy: 110, cx: 50, cy: 60, k1: 0.1, k2: 0.2, p1: 0.3, p2: 0.4, k3: 0.5, k4: 0.6, sx1: 0.7, sy1: 0.8 } },
  ];
  parityCases.forEach(({ name, modelId, params, expected }) => {
    it(`extracts intrinsics for ${name}`, () => {
      expect(getCameraIntrinsics(buildCamera({ modelId, params, width: 640, height: 480 }))).toMatchObject(expected);
    });
  });
});

describe('getCameraIntrinsics (EUCM/DIVISION new fields)', () => {
  it('EUCM: alpha and beta are extracted into alpha/beta fields', () => {
    const cam = buildCamera({ modelId: CameraModelId.EUCM, params: [900, 900, 640, 360, 0.6, 1.1] });
    const intr = getCameraIntrinsics(cam);
    expect(intr.alpha).toBe(0.6);
    expect(intr.beta).toBe(1.1);
  });

  it('DIVISION: k goes to kDiv, NOT k1', () => {
    const cam = buildCamera({ modelId: CameraModelId.DIVISION, params: [800, 810, 320, 240, -0.05] });
    const intr = getCameraIntrinsics(cam);
    expect(intr.kDiv).toBe(-0.05);
    expect(intr.k1).toBe(0);
  });

  it('SIMPLE_RADIAL: k still goes to k1 (unchanged behaviour)', () => {
    const cam = buildCamera({ modelId: CameraModelId.SIMPLE_RADIAL, params: [100, 50, 60, 0.1] });
    const intr = getCameraIntrinsics(cam);
    expect(intr.k1).toBe(0.1);
    expect(intr.kDiv).toBe(0);
  });
});

describe('getCameraIntrinsics (registry-driven)', () => {
  it('extracts fx/fy/cx/cy for the newly-wired DIVISION model', () => {
    const cam = buildCamera({ modelId: CameraModelId.DIVISION, params: [800, 810, 320, 240, -0.05] });
    const intr = getCameraIntrinsics(cam);
    expect(intr.fx).toBe(800);
    expect(intr.fy).toBe(810);
    expect(intr.cx).toBe(320);
    expect(intr.cy).toBe(240);
  });

  it('extracts fx/fy for EUCM and ignores alpha/beta', () => {
    const cam = buildCamera({ modelId: CameraModelId.EUCM, params: [900, 900, 640, 360, 0.6, 1.1] });
    const intr = getCameraIntrinsics(cam);
    expect(intr.fx).toBe(900);
    expect(intr.fy).toBe(900);
    expect(intr.cx).toBe(640);
    expect(intr.cy).toBe(360);
  });

  it('finishes RAD_TAN_THIN_PRISM_FISHEYE (id 11) instead of returning fx=1', () => {
    const params = [700, 705, 320, 240, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const intr = getCameraIntrinsics(buildCamera({ modelId: CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE, params }));
    expect(intr.fx).toBe(700);
    expect(intr.fy).toBe(705);
  });

  it('returns safe defaults for spherical (no pinhole intrinsics)', () => {
    const intr = getCameraIntrinsics(buildCamera({ modelId: CameraModelId.EQUIRECTANGULAR, params: [4096, 2048] }));
    expect(intr.fx).toBe(1);
    expect(intr.fy).toBe(1);
    expect(intr.cx).toBe(0);
    expect(intr.cy).toBe(0);
  });
});
