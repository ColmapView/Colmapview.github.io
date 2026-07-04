import { describe, expect, it } from 'vitest';
import { CameraModelId } from '../types/cameraModelId';
import type { Reconstruction } from '../types/colmap';
import {
  cameraModelSupportsSplatMetric,
  reconstructionHasSplatMetricCapableCamera,
  SPLAT_METRIC_SUPPORTED_PROJECTION_CLASSES,
} from './splatMetricCapability';

function reconstructionWithCameraModels(modelIds: CameraModelId[]): Reconstruction {
  const cameras = new Map();
  const images = new Map();
  modelIds.forEach((modelId, i) => {
    cameras.set(i, { cameraId: i, modelId, width: 100, height: 100, params: [] });
    images.set(i, { imageId: i, cameraId: i, name: `${i}.jpg`, qvec: [1, 0, 0, 0], tvec: [0, 0, 0], points2D: [], numPoints2D: 0 });
  });
  // Only the fields the predicate reads are required; cast through unknown for the rest.
  return { cameras, images } as unknown as Reconstruction;
}

describe('cameraModelSupportsSplatMetric', () => {
  it('is true only for the undistorted pinhole models', () => {
    expect(cameraModelSupportsSplatMetric(CameraModelId.SIMPLE_PINHOLE)).toBe(true);
    expect(cameraModelSupportsSplatMetric(CameraModelId.PINHOLE)).toBe(true);
  });

  it('is false for distorted pinhole, fisheye, and spherical models', () => {
    for (const id of [
      CameraModelId.SIMPLE_RADIAL, CameraModelId.RADIAL, CameraModelId.OPENCV,
      CameraModelId.FULL_OPENCV, CameraModelId.FOV, CameraModelId.SIMPLE_DIVISION,
      CameraModelId.DIVISION, CameraModelId.EUCM, CameraModelId.OPENCV_FISHEYE,
      CameraModelId.FISHEYE, CameraModelId.EQUIRECTANGULAR,
    ]) {
      expect(cameraModelSupportsSplatMetric(id)).toBe(false);
    }
  });

  it('exposes the supported projection-class set as data (today only "none")', () => {
    expect(SPLAT_METRIC_SUPPORTED_PROJECTION_CLASSES.has('none')).toBe(true);
    expect(SPLAT_METRIC_SUPPORTED_PROJECTION_CLASSES.has('fisheye')).toBe(false);
  });
});

describe('reconstructionHasSplatMetricCapableCamera', () => {
  it('is false for null, empty, spherical-only, and fisheye-only reconstructions', () => {
    expect(reconstructionHasSplatMetricCapableCamera(null)).toBe(false);
    expect(reconstructionHasSplatMetricCapableCamera(reconstructionWithCameraModels([]))).toBe(false);
    expect(reconstructionHasSplatMetricCapableCamera(reconstructionWithCameraModels([CameraModelId.EQUIRECTANGULAR]))).toBe(false);
    expect(reconstructionHasSplatMetricCapableCamera(reconstructionWithCameraModels([CameraModelId.FISHEYE, CameraModelId.OPENCV_FISHEYE]))).toBe(false);
  });

  it('is true when at least one plain-pinhole camera is present', () => {
    expect(reconstructionHasSplatMetricCapableCamera(reconstructionWithCameraModels([CameraModelId.EQUIRECTANGULAR, CameraModelId.PINHOLE]))).toBe(true);
    expect(reconstructionHasSplatMetricCapableCamera(reconstructionWithCameraModels([CameraModelId.SIMPLE_PINHOLE]))).toBe(true);
  });
});
