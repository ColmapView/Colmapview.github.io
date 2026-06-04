import { describe, expect, it } from 'vitest';
import { CameraModelId } from '../../../types/colmap';
import { buildCamera } from '../../../test/builders';
import {
  EXPORT_FORMAT_DESCRIPTIONS,
  EXPORT_FORMAT_OPTIONS,
  getCameraModelSummary,
  getExportProgressStyle,
} from './exportPanelViewModel';

describe('export panel view-model helpers', () => {
  it('defines stable export format labels and descriptions', () => {
    expect(EXPORT_FORMAT_OPTIONS.map((option) => option.value)).toEqual([
      'binary',
      'text',
      'ply',
      'zip',
    ]);
    expect(EXPORT_FORMAT_DESCRIPTIONS.binary).toContain('COLMAP binary');
    expect(EXPORT_FORMAT_DESCRIPTIONS.text).toContain('Human-readable');
    expect(EXPORT_FORMAT_DESCRIPTIONS.ply).toContain('Point cloud');
    expect(EXPORT_FORMAT_DESCRIPTIONS.zip).toContain('archive');
  });

  it('summarizes empty, single-model, and mixed camera model sets', () => {
    const pinhole = buildCamera({ cameraId: 1, modelId: CameraModelId.PINHOLE });
    const simpleRadial = buildCamera({ cameraId: 2, modelId: CameraModelId.SIMPLE_RADIAL });

    expect(getCameraModelSummary([])).toBeNull();
    expect(getCameraModelSummary([[pinhole.cameraId, pinhole]])).toBe('Pinhole');
    expect(getCameraModelSummary([
      [pinhole.cameraId, pinhole],
      [3, buildCamera({ cameraId: 3, modelId: CameraModelId.PINHOLE })],
    ])).toBe('2x Pinhole');
    expect(getCameraModelSummary([
      [pinhole.cameraId, pinhole],
      [simpleRadial.cameraId, simpleRadial],
    ])).toBe('2 cameras (mixed)');
  });

  it('uses the historical fallback for unknown camera models', () => {
    expect(getCameraModelSummary([[1, { modelId: 999 }]])).toBe('Unknown');
  });

  it('builds the export progress bar width style', () => {
    expect(getExportProgressStyle(0)).toEqual({ width: '0%' });
    expect(getExportProgressStyle(42)).toEqual({ width: '42%' });
    expect(getExportProgressStyle(100)).toEqual({ width: '100%' });
  });
});
