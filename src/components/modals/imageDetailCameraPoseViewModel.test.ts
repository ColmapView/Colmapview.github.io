import { describe, expect, it } from 'vitest';
import { CameraModelId } from '../../types/colmap';
import { buildCamera } from '../../test/builders';
import {
  buildCameraPoseDisplayModel,
  formatImageDetailCameraParam,
  getCameraPoseSignedValueClassName,
} from './imageDetailCameraPoseViewModel';

describe('image detail camera pose view model', () => {
  it('formats camera parameter values with compact precision', () => {
    expect(formatImageDetailCameraParam(1200.123)).toBe('1200.1');
    expect(formatImageDetailCameraParam(1)).toBe('1.0');
    expect(formatImageDetailCameraParam(0)).toBe('0');
    expect(formatImageDetailCameraParam(0.123456)).toBe('0.1235');
    expect(formatImageDetailCameraParam(-0.00034567)).toBe('-0.0003457');
  });

  it('maps signed camera pose values to display classes', () => {
    expect(getCameraPoseSignedValueClassName(-0.01)).toBe('text-ds-error');
    expect(getCameraPoseSignedValueClassName(0)).toBe('text-ds-primary');
    expect(getCameraPoseSignedValueClassName(0.01)).toBe('text-ds-primary');
  });

  it('builds camera pose metadata for the image detail header', () => {
    const camera = buildCamera({
      modelId: CameraModelId.PINHOLE,
      width: 800,
      height: 600,
      params: [1200.123, 1199.95, 400, 300, -0.25],
    });

    expect(buildCameraPoseDisplayModel(
      camera,
      [0.7071, -0.2, 0, 1.23456],
      [-1.234, 0, 0.009]
    )).toEqual({
      modelName: 'Pinhole',
      modelTitle: 'PINHOLE',
      width: 800,
      height: 600,
      parameters: [
        { name: 'fx', value: '1200.1' },
        { name: 'fy', value: '1200.0' },
        { name: 'cx', value: '400.0' },
        { name: 'cy', value: '300.0' },
        { name: 'p4', value: '-0.2500' },
      ],
      rotation: [
        { className: 'text-ds-error', value: '-0.200', isNegative: true },
        { className: 'text-ds-primary', value: '0.000', isNegative: false },
        { className: 'text-ds-primary', value: '1.235', isNegative: false },
        { className: 'text-ds-primary', value: '0.707', isNegative: false },
      ],
      translation: [
        { className: 'text-ds-error', value: '-1.23', isNegative: true },
        { className: 'text-ds-primary', value: '0.00', isNegative: false },
        { className: 'text-ds-primary', value: '0.01', isNegative: false },
      ],
    });
  });

  it('falls back for unknown camera model and parameter names', () => {
    const camera = {
      modelId: 99,
      width: 800,
      height: 600,
      params: [0.5],
    };

    expect(buildCameraPoseDisplayModel(camera, [1, 0, 0, 0], [0, 0, 0])).toMatchObject({
      modelName: 'MODEL_99',
      modelTitle: 'MODEL_99',
      parameters: [{ name: 'p0', value: '0.5000' }],
    });
  });

  it('omits camera parameters for a spherical (equirectangular) camera', () => {
    const camera = buildCamera({
      modelId: CameraModelId.EQUIRECTANGULAR,
      width: 4096,
      height: 2048,
      params: [4096, 2048],
    });

    const result = buildCameraPoseDisplayModel(
      camera,
      [0.5, 0.5, 0.5, 0.5],
      [1.0, -2.0, 3.0]
    );

    expect(result.modelName).toBe('Equirectangular');
    expect(result.modelTitle).toBe('EQUIRECTANGULAR');
    expect(result.width).toBe(4096);
    expect(result.height).toBe(2048);
    // Spherical cameras have no pinhole intrinsics — parameters are omitted rather
    // than showing the raw [w, h] params or dummy fx=1/fy=1/cx=0/cy=0 values.
    expect(result.parameters).toEqual([]);
    // Pose fields are still populated correctly.
    expect(result.rotation).toHaveLength(4);
    expect(result.translation).toHaveLength(3);
  });
});
