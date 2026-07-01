import { describe, it, expect } from 'vitest';
import { CameraModelId } from '../types/colmap';
import { isPerspectiveCameraModel, isFisheyeCameraModel, isSphericalCameraModel, PERSPECTIVE_CAMERA_MODELS, FISHEYE_CAMERA_MODELS, getCameraModelCompatibility } from './cameraModelPolicy';
import {
  type CameraModelFamily,
  type ProjectionClass,
  CAMERA_MODEL_DESCRIPTORS,
  getCameraModelNumParams,
  getCameraModelParamNames,
  getCameraModelColmapName,
  getCameraModelDisplayName,
  colmapNameToModelId,
  getCameraModelFamily,
  cameraModelHasPinholeIntrinsics,
  getCameraModelProjectionClass,
} from './cameraModelRegistry';

describe('cameraModelRegistry', () => {
  it('has a descriptor for every CameraModelId', () => {
    for (const id of Object.values(CameraModelId)) {
      expect(CAMERA_MODEL_DESCRIPTORS[id]).toBeDefined();
      expect(CAMERA_MODEL_DESCRIPTORS[id].id).toBe(id);
    }
  });

  it('param count equals paramNames length', () => {
    for (const id of Object.values(CameraModelId)) {
      expect(getCameraModelNumParams(id)).toBe(getCameraModelParamNames(id).length);
    }
  });

  it('round-trips colmap names', () => {
    for (const id of Object.values(CameraModelId)) {
      expect(colmapNameToModelId(getCameraModelColmapName(id))).toBe(id);
    }
  });

  it('classifies every model into its expected family', () => {
    const expectedFamily: Record<number, CameraModelFamily> = {
      [CameraModelId.SIMPLE_PINHOLE]: 'pinhole',
      [CameraModelId.PINHOLE]: 'pinhole',
      [CameraModelId.SIMPLE_RADIAL]: 'pinhole',
      [CameraModelId.RADIAL]: 'pinhole',
      [CameraModelId.OPENCV]: 'pinhole',
      [CameraModelId.OPENCV_FISHEYE]: 'fisheye',
      [CameraModelId.FULL_OPENCV]: 'pinhole',
      [CameraModelId.FOV]: 'pinhole',
      [CameraModelId.SIMPLE_RADIAL_FISHEYE]: 'fisheye',
      [CameraModelId.RADIAL_FISHEYE]: 'fisheye',
      [CameraModelId.THIN_PRISM_FISHEYE]: 'fisheye',
      [CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE]: 'fisheye',
      [CameraModelId.SIMPLE_DIVISION]: 'pinhole',
      [CameraModelId.DIVISION]: 'pinhole',
      [CameraModelId.SIMPLE_FISHEYE]: 'fisheye',
      [CameraModelId.FISHEYE]: 'fisheye',
      [CameraModelId.EUCM]: 'pinhole',
      [CameraModelId.EQUIRECTANGULAR]: 'spherical',
    };
    for (const id of Object.values(CameraModelId)) {
      expect(getCameraModelFamily(id)).toBe(expectedFamily[id]);
    }
  });

  it('only EQUIRECTANGULAR is spherical / lacks pinhole intrinsics', () => {
    for (const id of Object.values(CameraModelId)) {
      const isSpherical = id === CameraModelId.EQUIRECTANGULAR;
      expect(isSphericalCameraModel(id)).toBe(isSpherical);
      expect(cameraModelHasPinholeIntrinsics(id)).toBe(!isSpherical);
    }
  });

  it('classifies every model into its expected projectionClass', () => {
    const expectedProjectionClass: Record<number, ProjectionClass> = {
      [CameraModelId.SIMPLE_PINHOLE]: 'none',
      [CameraModelId.PINHOLE]: 'none',
      [CameraModelId.SIMPLE_RADIAL]: 'perspective-radial',
      [CameraModelId.RADIAL]: 'perspective-radial',
      [CameraModelId.OPENCV]: 'perspective-radial',
      [CameraModelId.OPENCV_FISHEYE]: 'fisheye',
      [CameraModelId.FULL_OPENCV]: 'perspective-radial',
      [CameraModelId.FOV]: 'fov',
      [CameraModelId.SIMPLE_RADIAL_FISHEYE]: 'fisheye',
      [CameraModelId.RADIAL_FISHEYE]: 'fisheye',
      [CameraModelId.THIN_PRISM_FISHEYE]: 'fisheye',
      [CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE]: 'fisheye',
      [CameraModelId.SIMPLE_DIVISION]: 'division',
      [CameraModelId.DIVISION]: 'division',
      [CameraModelId.SIMPLE_FISHEYE]: 'fisheye',
      [CameraModelId.FISHEYE]: 'fisheye',
      [CameraModelId.EUCM]: 'eucm',
      [CameraModelId.EQUIRECTANGULAR]: 'spherical',
    };
    for (const id of Object.values(CameraModelId)) {
      expect(getCameraModelProjectionClass(id)).toBe(expectedProjectionClass[id]);
    }
  });

  it('registry data matches known COLMAP values (independent of derived tables)', () => {
    const EXPECTED: Record<number, { colmapName: string; displayName: string; paramNames: string[] }> = {
      [CameraModelId.SIMPLE_PINHOLE]: { colmapName: 'SIMPLE_PINHOLE', displayName: 'Simple Pinhole', paramNames: ['f', 'cx', 'cy'] },
      [CameraModelId.PINHOLE]: { colmapName: 'PINHOLE', displayName: 'Pinhole', paramNames: ['fx', 'fy', 'cx', 'cy'] },
      [CameraModelId.SIMPLE_RADIAL]: { colmapName: 'SIMPLE_RADIAL', displayName: 'Simple Radial', paramNames: ['f', 'cx', 'cy', 'k'] },
      [CameraModelId.RADIAL]: { colmapName: 'RADIAL', displayName: 'Radial', paramNames: ['f', 'cx', 'cy', 'k1', 'k2'] },
      [CameraModelId.OPENCV]: { colmapName: 'OPENCV', displayName: 'OpenCV', paramNames: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2'] },
      [CameraModelId.OPENCV_FISHEYE]: { colmapName: 'OPENCV_FISHEYE', displayName: 'OpenCV Fisheye', paramNames: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'k3', 'k4'] },
      [CameraModelId.FULL_OPENCV]: { colmapName: 'FULL_OPENCV', displayName: 'Full OpenCV', paramNames: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2', 'k3', 'k4', 'k5', 'k6'] },
      [CameraModelId.FOV]: { colmapName: 'FOV', displayName: 'FOV', paramNames: ['fx', 'fy', 'cx', 'cy', 'ω'] },
      [CameraModelId.SIMPLE_RADIAL_FISHEYE]: { colmapName: 'SIMPLE_RADIAL_FISHEYE', displayName: 'Simple Radial Fisheye', paramNames: ['f', 'cx', 'cy', 'k'] },
      [CameraModelId.RADIAL_FISHEYE]: { colmapName: 'RADIAL_FISHEYE', displayName: 'Radial Fisheye', paramNames: ['f', 'cx', 'cy', 'k1', 'k2'] },
      [CameraModelId.THIN_PRISM_FISHEYE]: { colmapName: 'THIN_PRISM_FISHEYE', displayName: 'Thin Prism Fisheye', paramNames: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2', 'k3', 'k4', 'sx1', 'sy1'] },
      [CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE]: { colmapName: 'RAD_TAN_THIN_PRISM_FISHEYE', displayName: 'Rad-Tan Thin Prism', paramNames: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'p1', 'p2', 'sx1', 'sy1', 'sx2', 'sy2'] },
      [CameraModelId.SIMPLE_DIVISION]: { colmapName: 'SIMPLE_DIVISION', displayName: 'Simple Division', paramNames: ['f', 'cx', 'cy', 'k'] },
      [CameraModelId.DIVISION]: { colmapName: 'DIVISION', displayName: 'Division', paramNames: ['fx', 'fy', 'cx', 'cy', 'k'] },
      [CameraModelId.SIMPLE_FISHEYE]: { colmapName: 'SIMPLE_FISHEYE', displayName: 'Simple Fisheye', paramNames: ['f', 'cx', 'cy'] },
      [CameraModelId.FISHEYE]: { colmapName: 'FISHEYE', displayName: 'Fisheye', paramNames: ['fx', 'fy', 'cx', 'cy'] },
      [CameraModelId.EUCM]: { colmapName: 'EUCM', displayName: 'EUCM', paramNames: ['fx', 'fy', 'cx', 'cy', 'alpha', 'beta'] },
      [CameraModelId.EQUIRECTANGULAR]: { colmapName: 'EQUIRECTANGULAR', displayName: 'Equirectangular', paramNames: ['w', 'h'] },
    };
    for (const id of Object.values(CameraModelId)) {
      const expected = EXPECTED[id];
      expect(getCameraModelColmapName(id)).toBe(expected.colmapName);
      expect(getCameraModelDisplayName(id)).toBe(expected.displayName);
      expect(getCameraModelParamNames(id)).toEqual(expected.paramNames);
      expect(getCameraModelNumParams(id)).toBe(expected.paramNames.length);
    }
  });
});

describe('registry-derived classification parity', () => {
  it('reproduces perspective membership for the original models', () => {
    expect(isPerspectiveCameraModel(CameraModelId.PINHOLE)).toBe(true);
    expect(isPerspectiveCameraModel(CameraModelId.FULL_OPENCV)).toBe(true);
    expect(isPerspectiveCameraModel(CameraModelId.FOV)).toBe(true);
    expect(isPerspectiveCameraModel(CameraModelId.OPENCV_FISHEYE)).toBe(false);
  });

  it('classifies the previously-unwired RAD_TAN_THIN_PRISM_FISHEYE as fisheye', () => {
    expect(isFisheyeCameraModel(CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE)).toBe(true);
    expect(isPerspectiveCameraModel(CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE)).toBe(false);
    expect(isSphericalCameraModel(CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE)).toBe(false);
  });

  it('perspective/fisheye membership matches the expected COLMAP grouping', () => {
    expect([...PERSPECTIVE_CAMERA_MODELS].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 6, 7, 12, 13, 16]);
    expect([...FISHEYE_CAMERA_MODELS].sort((a, b) => a - b)).toEqual([5, 8, 9, 10, 11, 14, 15]);
  });

  it('treats new + spherical models as not convertible (incompatible)', () => {
    for (const id of [CameraModelId.SIMPLE_DIVISION, CameraModelId.DIVISION, CameraModelId.SIMPLE_FISHEYE,
                      CameraModelId.FISHEYE, CameraModelId.EUCM, CameraModelId.EQUIRECTANGULAR]) {
      expect(getCameraModelCompatibility(CameraModelId.PINHOLE, id)).toBe('incompatible');
      expect(getCameraModelCompatibility(id, CameraModelId.PINHOLE)).toBe('incompatible');
    }
  });
});
