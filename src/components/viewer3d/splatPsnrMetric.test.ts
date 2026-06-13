import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildCamera, buildImage } from '../../test/builders';
import { createSim3dFromEuler } from '../../utils/sim3dTransforms';
import {
  computeSplatMetricColorScale,
  computePsnrAndSsimFromRgba,
  computePsnrFromRgba,
  computePsnrFromRgbaWebGpu,
  createColmapPsnrCamera,
  createUndistortedGroundTruthPixelsFromImageData,
  ensureSplatPsnrWebGpuDevice,
  formatSplatPsnrMetric,
  formatSplatPsnrValue,
  formatSplatSsimMetric,
  formatSplatSsimValue,
  getSplatMetricScaleColor,
  getSplatPsnrColor,
  getSplatPsnrRenderSize,
  getSplatSsimColor,
  imageCoordinateToImageDataSampleCoordinate,
  subscribeSplatPsnrWebGpuDeviceLoss,
} from './splatPsnrMetric';

describe('splatPsnrMetric helpers', () => {
  it('formats PSNR values and maps the traffic-light color scale', () => {
    expect(formatSplatPsnrValue(undefined)).toBe('--');
    expect(formatSplatPsnrMetric(31.24)).toBe('31.2 dB PSNR');
    expect(formatSplatPsnrValue(Infinity)).toBe('99+');

    expect(getSplatPsnrColor(undefined)).toBe('#6b7280');
    expect(getSplatPsnrColor(8)).toBe('#ef4444');
    expect(getSplatPsnrColor(30)).toBe('#22c55e');
    expect(getSplatPsnrColor(100)).toBe('#22c55e');

    expect(formatSplatSsimValue(undefined)).toBe('--');
    expect(formatSplatSsimMetric(0.9428)).toBe('0.943 SSIM');
    expect(getSplatSsimColor(undefined)).toBe('#6b7280');
    expect(getSplatSsimColor(0.4)).toBe('#ef4444');
    expect(getSplatSsimColor(0.95)).toBe('#22c55e');
  });

  it('maps metric frustum colors across the active min-max range', () => {
    const scale = computeSplatMetricColorScale([10, 20, 30, 40]);

    expect(scale).toEqual({ min: 10, max: 40 });
    expect(getSplatMetricScaleColor(undefined, scale)).toBe('#6b7280');
    expect(getSplatMetricScaleColor(10, scale)).toBe('#ef4444');
    expect(getSplatMetricScaleColor(20, scale)).toBe('#fb923c');
    expect(getSplatMetricScaleColor(30, scale)).toBe('#facc15');
    expect(getSplatMetricScaleColor(40, scale)).toBe('#22c55e');
    expect(getSplatMetricScaleColor(50, scale)).toBe('#22c55e');
  });

  it('uses full-resolution render dimensions by default', () => {
    expect(getSplatPsnrRenderSize(buildCamera({ width: 1000, height: 500 }))).toEqual({
      width: 1000,
      height: 500,
      scale: 1,
    });
    expect(getSplatPsnrRenderSize(buildCamera({ width: 200, height: 100 }))).toEqual({
      width: 200,
      height: 100,
      scale: 1,
    });
    expect(getSplatPsnrRenderSize(buildCamera({ width: 0, height: 100 }))).toEqual({
      width: 0,
      height: 0,
      scale: 0,
    });
  });

  it('applies an explicit max dimension only when requested', () => {
    expect(getSplatPsnrRenderSize(buildCamera({ width: 1000, height: 500 }), 512)).toEqual({
      width: 512,
      height: 256,
      scale: 0.512,
    });
    expect(getSplatPsnrRenderSize(buildCamera({ width: 1000, height: 500 }), 0)).toEqual({
      width: 0,
      height: 0,
      scale: 0,
    });
  });

  it('maps image-coordinate pixel centers to ImageData sample coordinates', () => {
    expect(imageCoordinateToImageDataSampleCoordinate(0.5, 1)).toBe(0);
    expect(imageCoordinateToImageDataSampleCoordinate(3.5, 1)).toBe(3);

    expect(imageCoordinateToImageDataSampleCoordinate(1, 1)).toBe(0.5);
    expect(imageCoordinateToImageDataSampleCoordinate(7, 1)).toBe(6.5);
  });

  it('downsamples pinhole ground-truth pixels without a half-output-pixel shift', () => {
    const sourceWidth = 8;
    const sourceHeight = 4;
    const sourcePixels = new Uint8ClampedArray(sourceWidth * sourceHeight * 4);
    for (let y = 0; y < sourceHeight; y++) {
      for (let x = 0; x < sourceWidth; x++) {
        const offset = (y * sourceWidth + x) * 4;
        sourcePixels[offset] = x * 10;
        sourcePixels[offset + 1] = y * 20;
        sourcePixels[offset + 2] = 100;
        sourcePixels[offset + 3] = 255;
      }
    }

    const target = createUndistortedGroundTruthPixelsFromImageData(
      sourcePixels,
      sourceWidth,
      sourceHeight,
      buildCamera({
        width: sourceWidth,
        height: sourceHeight,
        params: [20, 20, sourceWidth / 2, sourceHeight / 2],
      }),
      4,
      2
    );

    expect(Array.from(target.slice(0, 8))).toEqual([
      5, 10, 100, 255,
      25, 10, 100, 255,
    ]);
    expect(Array.from(target.slice((1 * 4 + 3) * 4, (1 * 4 + 4) * 4))).toEqual([
      65, 50, 100, 255,
    ]);
  });

  it('builds a viewer-aligned camera that projects COLMAP pixels back to image coordinates', () => {
    const camera = buildCamera({
      width: 800,
      height: 400,
      params: [200, 400, 410, 190],
    });
    const image = buildImage({ cameraId: camera.cameraId });
    const psnrCamera = createColmapPsnrCamera(image, camera, camera.width, camera.height);

    expect(psnrCamera.fov).toBeCloseTo(2 * Math.atan(camera.height / (2 * 400)) * 180 / Math.PI);
    expect(psnrCamera.aspect).toBeCloseTo(2);

    const expectPixelClose = (actual: [number, number], expected: [number, number]) => {
      expect(actual[0]).toBeCloseTo(expected[0]);
      expect(actual[1]).toBeCloseTo(expected[1]);
    };
    const projectPixel = (u: number, v: number): [number, number] => {
      const z = 2;
      const point = new THREE.Vector3(
        (u - 410) / 200 * z,
        (v - 190) / 400 * z,
        z
      );
      const ndc = point.project(psnrCamera);
      return [
        (ndc.x + 1) * 0.5 * camera.width,
        (1 - ndc.y) * 0.5 * camera.height,
      ];
    };

    expectPixelClose(projectPixel(410, 190), [410, 190]);
    expectPixelClose(projectPixel(0, 0), [0, 0]);
    expectPixelClose(projectPixel(800, 400), [800, 400]);
  });

  it('keeps transformed splat points aligned with the transformed COLMAP camera', () => {
    const camera = buildCamera({
      width: 800,
      height: 400,
      params: [200, 400, 410, 190],
    });
    const image = buildImage({ cameraId: camera.cameraId });
    const transform = {
      scale: 2,
      rotationX: 0.15,
      rotationY: -0.2,
      rotationZ: 0.35,
      translationX: 3,
      translationY: -2,
      translationZ: 5,
    };
    const sim3d = createSim3dFromEuler(transform);
    const psnrCamera = createColmapPsnrCamera(
      image,
      camera,
      camera.width,
      camera.height,
      transform
    );

    const expectPixelClose = (actual: [number, number], expected: [number, number]) => {
      expect(actual[0]).toBeCloseTo(expected[0]);
      expect(actual[1]).toBeCloseTo(expected[1]);
    };
    const projectTransformedPixel = (u: number, v: number): [number, number] => {
      const z = 2;
      const point = new THREE.Vector3(
        (u - 410) / 200 * z,
        (v - 190) / 400 * z,
        z
      );
      point.applyQuaternion(sim3d.rotation)
        .multiplyScalar(sim3d.scale)
        .add(sim3d.translation);
      const ndc = point.project(psnrCamera);
      return [
        (ndc.x + 1) * 0.5 * camera.width,
        (1 - ndc.y) * 0.5 * camera.height,
      ];
    };

    expectPixelClose(projectTransformedPixel(410, 190), [410, 190]);
    expectPixelClose(projectTransformedPixel(0, 0), [0, 0]);
    expectPixelClose(projectTransformedPixel(800, 400), [800, 400]);
  });

  it('computes PSNR over valid ground-truth pixels only', () => {
    const exact = computePsnrFromRgba(
      new Uint8Array([10, 20, 30, 255, 200, 200, 200, 255]),
      new Uint8Array([10, 20, 30, 255, 1, 1, 1, 0])
    );
    expect(exact.psnr).toBe(Infinity);
    expect(exact.mse).toBe(0);
    expect(exact.validPixelCount).toBe(1);

    const blackVsWhite = computePsnrFromRgba(
      new Uint8Array([0, 0, 0, 255]),
      new Uint8Array([255, 255, 255, 255])
    );
    expect(blackVsWhite.psnr).toBeCloseTo(0);
    expect(blackVsWhite.mse).toBe(255 * 255);
    expect(blackVsWhite.validPixelCount).toBe(1);
  });

  it('computes CPU PSNR and SSIM for RGBA metric buffers', () => {
    const exact = computePsnrAndSsimFromRgba(
      new Uint8Array([
        10, 20, 30, 255,
        40, 50, 60, 255,
        70, 80, 90, 255,
        100, 110, 120, 255,
      ]),
      new Uint8Array([
        10, 20, 30, 255,
        40, 50, 60, 255,
        70, 80, 90, 255,
        100, 110, 120, 255,
      ]),
      { width: 2, height: 2 }
    );

    expect(exact.psnr).toBe(Infinity);
    expect(exact.mse).toBe(0);
    expect(exact.validPixelCount).toBe(4);
    expect(exact.ssim).toBeCloseTo(1);

    const different = computePsnrAndSsimFromRgba(
      new Uint8Array([
        0, 0, 0, 255,
        0, 0, 0, 255,
        0, 0, 0, 255,
        0, 0, 0, 255,
      ]),
      new Uint8Array([
        255, 255, 255, 255,
        255, 255, 255, 255,
        255, 255, 255, 255,
        255, 255, 255, 255,
      ]),
      { width: 2, height: 2 }
    );

    expect(different.psnr).toBeCloseTo(0);
    expect(different.ssim).toBeLessThan(0.01);
  });

  it('applies masks to CPU PSNR and SSIM metrics', () => {
    const result = computePsnrAndSsimFromRgba(
      new Uint8Array([
        10, 10, 10, 255,
        255, 255, 255, 255,
      ]),
      new Uint8Array([
        10, 10, 10, 255,
        0, 0, 0, 255,
      ]),
      {
        width: 2,
        height: 1,
        maskPixels: new Uint8Array([
          255, 255, 255, 255,
          0, 0, 0, 255,
        ]),
      }
    );

    expect(result.psnr).toBe(Infinity);
    expect(result.validPixelCount).toBe(1);
    expect(result.ssim).toBeCloseTo(1);
  });

  it('requires WebGPU for the GPU PSNR path', async () => {
    await expect(computePsnrFromRgbaWebGpu(
      new Uint8Array([10, 20, 30, 255]),
      new Uint8Array([10, 20, 30, 255])
    )).rejects.toThrow('WebGPU is required for PSNR computation');
  });

  it('invalidates the cached PSNR device after WebGPU device loss', async () => {
    const originalGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    const firstLost = createDeferredDeviceLoss();
    const secondLost = createDeferredDeviceLoss();
    const deviceLossEvents: GPUDeviceLostInfo[] = [];
    const firstDevice = { lost: firstLost.promise } as unknown as GPUDevice;
    const secondDevice = { lost: secondLost.promise } as unknown as GPUDevice;
    const adapter = {
      requestDevice: vi.fn()
        .mockResolvedValueOnce(firstDevice)
        .mockResolvedValueOnce(secondDevice),
    };
    const gpu = {
      requestAdapter: vi.fn().mockResolvedValue(adapter),
    };

    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: gpu,
    });
    const unsubscribe = subscribeSplatPsnrWebGpuDeviceLoss((info) => {
      deviceLossEvents.push(info);
    });

    try {
      await expect(ensureSplatPsnrWebGpuDevice()).resolves.toBe(firstDevice);
      const firstLossInfo = { message: 'lost', reason: 'destroyed' } as GPUDeviceLostInfo;
      firstLost.resolve(firstLossInfo);
      await Promise.resolve();
      await Promise.resolve();

      await expect(ensureSplatPsnrWebGpuDevice()).resolves.toBe(secondDevice);
      expect(gpu.requestAdapter).toHaveBeenCalledTimes(2);
      expect(adapter.requestDevice).toHaveBeenCalledTimes(2);
      expect(deviceLossEvents).toEqual([firstLossInfo]);
    } finally {
      unsubscribe();
      secondLost.resolve({ message: 'cleanup', reason: 'destroyed' } as GPUDeviceLostInfo);
      Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: originalGpu,
      });
      await Promise.resolve();
    }
  });
});

function createDeferredDeviceLoss() {
  let resolve!: (value: GPUDeviceLostInfo) => void;
  const promise = new Promise<GPUDeviceLostInfo>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
