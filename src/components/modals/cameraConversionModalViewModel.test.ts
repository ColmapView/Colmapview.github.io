import { describe, expect, it } from 'vitest';
import {
  applyCameraModelConversion,
  buildCameraConversionOptions,
  buildCameraConversionParameterRows,
  buildCameraConversionTargetOptions,
  CAMERA_CONVERSION_MODAL_ESTIMATED_HEIGHT,
  CAMERA_CONVERSION_MODAL_ESTIMATED_WIDTH,
  formatCameraConversionParamValue,
  getCameraConversionActionState,
  getCameraConversionCharacterizationClassName,
  getCameraConversionCharacterizationLabel,
  getCameraConversionModalHeaderDragStyle,
  getCameraConversionModalOverlayStyle,
  getCameraConversionModalPanelStyle,
  getCameraConversionNotificationMessage,
  getCameraConversionParameterRowDisplay,
  getCommonConversionTargetModels,
  getEffectiveConversionTargetModelId,
  getReconstructionCameraEntries,
  getSelectedConversionCameras,
  getSourceConversionModelIds,
  parseCameraConversionSelection,
  parseCameraConversionTarget,
} from './cameraConversionModalViewModel';
import { buildCamera, buildReconstruction } from '../../test/builders';
import { CameraModelId } from '../../types/colmap';
import type { ConversionPreview } from '../../utils/cameraModelConversions';

describe('CameraConversionModal view-model helpers', () => {
  it('builds camera options and selected camera lists from a reconstruction', () => {
    const cameraA = buildCamera({
      cameraId: 2,
      modelId: CameraModelId.PINHOLE,
      params: [500, 520, 320, 240],
    });
    const cameraB = buildCamera({
      cameraId: 1,
      modelId: CameraModelId.OPENCV,
      params: [500, 500, 320, 240, 0, 0, 0, 0],
    });
    const reconstruction = buildReconstruction({ cameras: [cameraA, cameraB] });

    expect(getReconstructionCameraEntries(reconstruction)).toEqual([
      [cameraA.cameraId, cameraA],
      [cameraB.cameraId, cameraB],
    ]);
    expect(buildCameraConversionOptions(getReconstructionCameraEntries(reconstruction))).toEqual([
      { value: 'all', label: 'All (2)' },
      { value: '2', label: '#2: OpenCV K' },
      { value: '1', label: '#1: OpenCV' },
    ]);
    expect(getSelectedConversionCameras(reconstruction, 'all')).toEqual([cameraA, cameraB]);
    expect(getSelectedConversionCameras(reconstruction, cameraB.cameraId)).toEqual([cameraB]);
    expect(getSelectedConversionCameras(reconstruction, 99)).toEqual([]);
    expect(getSourceConversionModelIds([cameraA, cameraB])).toEqual([
      CameraModelId.PINHOLE,
      CameraModelId.OPENCV,
    ]);
  });

  it('derives common target models and preserves enum value 0 as a valid target', () => {
    const pinholeTargets = getCommonConversionTargetModels([CameraModelId.PINHOLE]);
    expect(pinholeTargets).toContainEqual({
      modelId: CameraModelId.SIMPLE_PINHOLE,
      compatibility: 'approximate',
    });
    expect(getEffectiveConversionTargetModelId(CameraModelId.SIMPLE_PINHOLE, pinholeTargets)).toBe(
      CameraModelId.SIMPLE_PINHOLE
    );
    expect(getEffectiveConversionTargetModelId(CameraModelId.OPENCV_FISHEYE, pinholeTargets)).toBeNull();
    expect(buildCameraConversionTargetOptions([
      { modelId: CameraModelId.OPENCV, compatibility: 'exact' },
      { modelId: CameraModelId.SIMPLE_RADIAL, compatibility: 'approximate' },
    ])).toEqual([
      { value: String(CameraModelId.OPENCV), label: 'OpenCV' },
      { value: String(CameraModelId.SIMPLE_RADIAL), label: 'Simple Radial ~' },
    ]);

    const mixedTargets = getCommonConversionTargetModels([CameraModelId.PINHOLE, CameraModelId.OPENCV]);
    expect(mixedTargets).toContainEqual({
      modelId: CameraModelId.SIMPLE_RADIAL,
      compatibility: 'approximate',
    });
    expect(mixedTargets).not.toContainEqual(expect.objectContaining({
      modelId: CameraModelId.OPENCV_FISHEYE,
    }));
  });

  it('parses select values without dropping model id zero', () => {
    const cameraOptions = [
      { value: 'all', label: 'All (2)' },
      { value: '7', label: '#7: OpenCV K' },
    ];

    expect(parseCameraConversionSelection('all', cameraOptions)).toBe('all');
    expect(parseCameraConversionSelection('7', cameraOptions)).toBe(7);
    expect(parseCameraConversionSelection('8', cameraOptions)).toBeNull();
    expect(parseCameraConversionSelection('7px', cameraOptions)).toBeNull();
    expect(parseCameraConversionTarget('')).toBeNull();
    expect(parseCameraConversionTarget('0')).toBe(CameraModelId.SIMPLE_PINHOLE);
    expect(parseCameraConversionTarget('999')).toBeNull();
    expect(parseCameraConversionTarget('0px')).toBeNull();
    expect(parseCameraConversionTarget('not-a-model')).toBeNull();
  });

  it('derives modal dimensions and render styles', () => {
    expect(CAMERA_CONVERSION_MODAL_ESTIMATED_WIDTH).toBe(360);
    expect(CAMERA_CONVERSION_MODAL_ESTIMATED_HEIGHT).toBe(160);
    expect(getCameraConversionModalOverlayStyle(71)).toEqual({ zIndex: 71 });
    expect(getCameraConversionModalPanelStyle({ x: 12, y: 34 })).toEqual({
      left: 12,
      top: 34,
    });
    expect(getCameraConversionModalHeaderDragStyle()).toEqual({ touchAction: 'none' });
  });

  it('builds parameter preview rows and display labels', () => {
    const preview: ConversionPreview = {
      sourceParamNames: ['fx', 'fy', 'cx', 'cy', 'k1'],
      sourceParams: [500, 520, 320, 240, 0.01],
      targetParamNames: ['f', 'cx', 'cy', 'k1', 'k2'],
      targetParams: [510, 320, 240, 0.01, 0],
      characterization: 'lossy',
      isLossy: true,
      isExpansion: false,
      description: 'Dropping: fy',
    };

    expect(buildCameraConversionParameterRows(preview)).toEqual([
      { name: 'fx', sourceValue: 500, targetValue: 0, status: 'removed' },
      { name: 'fy', sourceValue: 520, targetValue: 0, status: 'removed' },
      { name: 'cx', sourceValue: 320, targetValue: 320, status: 'unchanged' },
      { name: 'cy', sourceValue: 240, targetValue: 240, status: 'unchanged' },
      { name: 'k1', sourceValue: 0.01, targetValue: 0.01, status: 'unchanged' },
      { name: 'f', sourceValue: null, targetValue: 510, status: 'new' },
      { name: 'k2', sourceValue: null, targetValue: 0, status: 'new' },
    ]);
    expect(buildCameraConversionParameterRows(null)).toEqual([]);
    expect(getCameraConversionCharacterizationClassName('exact')).toBe('text-green-400');
    expect(getCameraConversionCharacterizationClassName('expansion')).toBe('text-blue-400');
    expect(getCameraConversionCharacterizationClassName('lossy')).toBe('text-amber-400');
    expect(getCameraConversionCharacterizationClassName('approximation')).toBe('text-orange-400');
    expect(getCameraConversionCharacterizationLabel('exact')).toBe('Exact');
    expect(getCameraConversionCharacterizationLabel('expansion')).toBe('Expansion');
    expect(getCameraConversionCharacterizationLabel('lossy')).toBe('Lossy');
    expect(getCameraConversionCharacterizationLabel('approximation')).toBe('Approx');
    expect(formatCameraConversionParamValue(0)).toBe('0');
    expect(formatCameraConversionParamValue(1234)).toBe('1.23e+3');
    expect(formatCameraConversionParamValue(0.001234)).toBe('1.23e-3');
    expect(formatCameraConversionParamValue(1.2300)).toBe('1.23');
    expect(getCameraConversionActionState(CameraModelId.OPENCV, 2)).toEqual({
      canConvert: true,
      label: 'Convert (2)',
    });
    expect(getCameraConversionActionState(null, 2)).toEqual({
      canConvert: false,
      label: 'Convert (2)',
    });
    expect(getCameraConversionActionState(CameraModelId.OPENCV, 0)).toEqual({
      canConvert: false,
      label: 'Convert',
    });
  });

  it('derives parameter preview row display state from status and values', () => {
    expect(getCameraConversionParameterRowDisplay({
      name: 'f',
      sourceValue: null,
      targetValue: 510,
      status: 'new',
    })).toEqual({
      name: 'f',
      nameClassName: 'flex-1 text-center px-2 text-blue-400',
      sourceClassName: 'w-16 text-right text-ds-primary',
      sourceValueLabel: '\u2014',
      targetClassName: 'w-16 text-left text-blue-400',
      targetValueLabel: '5.10e+2',
    });

    expect(getCameraConversionParameterRowDisplay({
      name: 'fx',
      sourceValue: 500,
      targetValue: 0,
      status: 'removed',
    })).toEqual({
      name: 'fx',
      nameClassName: 'flex-1 text-center px-2 text-red-400',
      sourceClassName: 'w-16 text-right text-red-400 line-through',
      sourceValueLabel: '5.00e+2',
      targetClassName: 'w-16 text-left text-ds-muted',
      targetValueLabel: '\u2014',
    });

    expect(getCameraConversionParameterRowDisplay({
      name: 'cx',
      sourceValue: 320,
      targetValue: 330,
      status: 'changed',
    })).toMatchObject({
      nameClassName: 'flex-1 text-center px-2 text-ds-muted',
      targetClassName: 'w-16 text-left text-amber-400',
      targetValueLabel: '3.30e+2',
    });
  });

  it('applies exact and approximate conversions without mutating the source reconstruction', () => {
    const pinhole = buildCamera({
      cameraId: 1,
      modelId: CameraModelId.PINHOLE,
      params: [500, 520, 320, 240],
    });
    const opencv = buildCamera({
      cameraId: 2,
      modelId: CameraModelId.OPENCV,
      params: [500, 520, 320, 240, 0.1, 0.05, 0.01, 0.02],
    });
    const reconstruction = buildReconstruction({ cameras: [pinhole, opencv] });

    const exactResult = applyCameraModelConversion({
      reconstruction,
      selectedCameras: [pinhole],
      targetModelId: CameraModelId.OPENCV,
    });
    expect(exactResult).toMatchObject({ convertedCount: 1, approximateCount: 0 });
    expect(exactResult?.reconstruction.cameras.get(pinhole.cameraId)).toMatchObject({
      modelId: CameraModelId.OPENCV,
      params: [500, 520, 320, 240, 0, 0, 0, 0],
    });
    expect(reconstruction.cameras.get(pinhole.cameraId)?.modelId).toBe(CameraModelId.PINHOLE);

    const approximateResult = applyCameraModelConversion({
      reconstruction,
      selectedCameras: [opencv],
      targetModelId: CameraModelId.SIMPLE_RADIAL,
    });
    expect(approximateResult).toMatchObject({ convertedCount: 1, approximateCount: 1 });
    expect(approximateResult?.reconstruction.cameras.get(opencv.cameraId)?.modelId).toBe(
      CameraModelId.SIMPLE_RADIAL
    );
    expect(getCameraConversionNotificationMessage({
      convertedCount: 1,
      approximateCount: 1,
      targetModelId: CameraModelId.SIMPLE_RADIAL,
    })).toBe('Converted 1 camera(s) to Simple Radial (~)');
    expect(getCameraConversionNotificationMessage({
      convertedCount: 2,
      approximateCount: 0,
      targetModelId: CameraModelId.OPENCV,
    })).toBe('Converted 2 camera(s) to OpenCV');
  });

  it('returns null when no selected cameras are compatible with the target', () => {
    const opencv = buildCamera({
      modelId: CameraModelId.OPENCV,
      params: [500, 500, 320, 240, 0, 0, 0, 0],
    });
    const reconstruction = buildReconstruction({ cameras: [opencv] });

    expect(applyCameraModelConversion({
      reconstruction,
      selectedCameras: [opencv],
      targetModelId: CameraModelId.OPENCV_FISHEYE,
    })).toBeNull();
  });
});
