import { describe, it, expect } from 'vitest';
import { CameraModelId, type Camera, type CameraId } from '../types/colmap';
import { getCameraModelNumParams } from '../utils/cameraModelRegistry';
import { buildCamera } from '../test/builders';
import { parseCamerasText, parseCamerasBinary } from './cameras';
import { writeCamerasText } from './colmapTextWriters';
import { writeCamerasBinary } from './colmapBinaryWriters';

/**
 * parse -> write -> parse round-trip for the COLMAP 4.1 camera models (ids 11-17),
 * over BOTH the text and binary writers.
 *
 * The text path runs every param through formatDouble; the binary path writes raw
 * float64. Param arrays match the registry param counts exactly (required for
 * binary read alignment) and embed tiny scientific-notation coefficients
 * (5e-10, -3.7e-10, 1.23e-10) in high-order slots to exercise the exponent path
 * that formatDouble used to corrupt. toPrecision(17) is lossless, so equality is
 * exact after the fix.
 */
const MODELS_11_TO_17: ReadonlyArray<{ modelId: CameraModelId; params: number[] }> = [
  // 11 RAD_TAN_THIN_PRISM_FISHEYE (16): fx fy cx cy k1 k2 k3 k4 k5 k6 p1 p2 sx1 sy1 sx2 sy2
  {
    modelId: CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE,
    params: [1000.5, 1000.25, 960, 540, 0.1, -0.02, 0.003, -0.0004, 1e-5, 5e-10, 0.01, -0.02, 1e-5, -2e-5, -3.7e-10, 1.23e-10],
  },
  // 12 SIMPLE_DIVISION (4): f cx cy k
  { modelId: CameraModelId.SIMPLE_DIVISION, params: [800.5, 640, 480, 5e-10] },
  // 13 DIVISION (5): fx fy cx cy k
  { modelId: CameraModelId.DIVISION, params: [800.5, 800.25, 640, 480, -3.7e-10] },
  // 14 SIMPLE_FISHEYE (3): f cx cy
  { modelId: CameraModelId.SIMPLE_FISHEYE, params: [500.5, 320, 240] },
  // 15 FISHEYE (4): fx fy cx cy
  { modelId: CameraModelId.FISHEYE, params: [500.5, 500.25, 320, 240] },
  // 16 EUCM (6): fx fy cx cy alpha beta
  { modelId: CameraModelId.EUCM, params: [1000.5, 1000.25, 960, 540, 0.6, 1.1] },
  // 17 EQUIRECTANGULAR (2): w h
  { modelId: CameraModelId.EQUIRECTANGULAR, params: [4096, 2048] },
];

function buildCameras(): Map<CameraId, Camera> {
  const cameras = new Map<CameraId, Camera>();
  MODELS_11_TO_17.forEach(({ modelId, params }, i) => {
    // Self-check: the fixture matches the registry's param count (guards typos and
    // keeps binary read alignment honest).
    expect(params, `model ${modelId} param count`).toHaveLength(getCameraModelNumParams(modelId));
    const cameraId = i + 1;
    cameras.set(cameraId, buildCamera({ cameraId, modelId, width: 4096, height: 2048, params }));
  });
  return cameras;
}

function assertRoundTrip(original: Map<CameraId, Camera>, reparsed: Map<CameraId, Camera>): void {
  expect(reparsed.size).toBe(original.size);
  for (const [cameraId, cam] of original) {
    const rt = reparsed.get(cameraId);
    expect(rt, `camera ${cameraId}`).toBeDefined();
    expect(rt!.modelId).toBe(cam.modelId);
    expect(rt!.width).toBe(cam.width);
    expect(rt!.height).toBe(cam.height);
    // Exact, element-for-element: toPrecision(17) round-trips every float64.
    expect(rt!.params).toEqual(cam.params);
  }
}

describe('camera export round-trip (COLMAP 4.1 models 11-17)', () => {
  it('text: parse(writeCamerasText(cameras)) preserves every param exactly', () => {
    const cameras = buildCameras();
    assertRoundTrip(cameras, parseCamerasText(writeCamerasText(cameras)));
  });

  it('binary: parse(writeCamerasBinary(cameras)) preserves every param exactly', () => {
    const cameras = buildCameras();
    assertRoundTrip(cameras, parseCamerasBinary(writeCamerasBinary(cameras)));
  });

  it('text round-trip preserves the tiny scientific-notation coefficients', () => {
    const cameras = buildCameras();
    const reparsed = parseCamerasText(writeCamerasText(cameras));
    // SIMPLE_DIVISION (camera 2) k = 5e-10 ; DIVISION (camera 3) k = -3.7e-10
    expect(reparsed.get(2)!.params[3]).toBe(5e-10);
    expect(reparsed.get(3)!.params[4]).toBe(-3.7e-10);
    // RAD_TAN_THIN_PRISM_FISHEYE (camera 1) k6 = 5e-10 (slot 9), sx2 = -3.7e-10 (slot 14)
    expect(reparsed.get(1)!.params[9]).toBe(5e-10);
    expect(reparsed.get(1)!.params[14]).toBe(-3.7e-10);
  });
});
