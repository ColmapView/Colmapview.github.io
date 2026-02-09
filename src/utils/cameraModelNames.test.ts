import { describe, it, expect } from 'vitest';
import { CameraModelId } from '../types/colmap';
import {
  CAMERA_MODEL_NAMES,
  CAMERA_MODEL_COLMAP_NAMES,
  getCameraModelName,
} from './cameraModelNames';

const ALL_MODEL_IDS = Object.values(CameraModelId) as number[];

describe('CAMERA_MODEL_NAMES', () => {
  it('has an entry for every CameraModelId', () => {
    for (const id of ALL_MODEL_IDS) {
      expect(CAMERA_MODEL_NAMES[id]).toBeDefined();
    }
  });

  it('returns human-readable names (no underscores)', () => {
    for (const id of ALL_MODEL_IDS) {
      expect(CAMERA_MODEL_NAMES[id]).not.toContain('_');
    }
  });

  it('has exactly the same number of entries as CameraModelId', () => {
    expect(Object.keys(CAMERA_MODEL_NAMES)).toHaveLength(ALL_MODEL_IDS.length);
  });
});

describe('CAMERA_MODEL_COLMAP_NAMES', () => {
  it('has an entry for every CameraModelId', () => {
    for (const id of ALL_MODEL_IDS) {
      expect(CAMERA_MODEL_COLMAP_NAMES[id]).toBeDefined();
    }
  });

  it('returns SCREAMING_SNAKE_CASE names', () => {
    for (const id of ALL_MODEL_IDS) {
      const name = CAMERA_MODEL_COLMAP_NAMES[id];
      expect(name).toMatch(/^[A-Z_]+$/);
    }
  });

  it('has exactly the same number of entries as CameraModelId', () => {
    expect(Object.keys(CAMERA_MODEL_COLMAP_NAMES)).toHaveLength(ALL_MODEL_IDS.length);
  });

  it('matches the CameraModelId key names', () => {
    const enumKeys = Object.keys(CameraModelId).filter(k => isNaN(Number(k)));
    for (const key of enumKeys) {
      const id = CameraModelId[key as keyof typeof CameraModelId];
      expect(CAMERA_MODEL_COLMAP_NAMES[id]).toBe(key);
    }
  });
});

describe('getCameraModelName', () => {
  it('returns human-readable name for valid model IDs', () => {
    expect(getCameraModelName(0)).toBe('Simple Pinhole');
    expect(getCameraModelName(1)).toBe('Pinhole');
    expect(getCameraModelName(4)).toBe('OpenCV');
  });

  it('returns fallback string for unknown model IDs', () => {
    expect(getCameraModelName(99)).toBe('Unknown (99)');
    expect(getCameraModelName(-1)).toBe('Unknown (-1)');
  });
});
