import { describe, expect, it } from 'vitest';
import { formatManifestValidationIssues, validateColmapManifest } from './manifestValidation';

const manifest = {
  version: 1,
  baseUrl: 'https://example.com/colmap-data',
  files: {
    cameras: 'sparse/0/cameras.bin',
    images: 'sparse/0/images.bin',
    points3D: 'sparse/0/points3D.bin',
  },
};

describe('manifest validation helpers', () => {
  it('returns typed manifests for valid manifest-like data', () => {
    const result = validateColmapManifest({
      ...manifest,
      splats: ['splats/model.ply'],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.manifest.files.points3D).toBe('sparse/0/points3D.bin');
      expect(result.manifest.splats).toEqual(['splats/model.ply']);
    }
  });

  it('returns shared issue details for invalid manifest data', () => {
    const result = validateColmapManifest({
      ...manifest,
      baseUrl: 'not-a-url',
      files: {
        cameras: '',
        images: 'sparse/0/images.bin',
        points3D: 'sparse/0/points3D.bin',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.details).toContain('baseUrl');
      expect(result.details).toContain('files.cameras');
    }
  });

  it('rejects empty manifest splat paths', () => {
    const result = validateColmapManifest({
      ...manifest,
      splats: [''],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.details).toContain('splats.0');
    }
  });

  it('formats validation issues using schema paths', () => {
    const result = validateColmapManifest({ version: 1 });
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(formatManifestValidationIssues([])).toBe('');
      expect(result.details).toContain('baseUrl');
      expect(result.details).toContain('files');
      expect(result.details).toContain('; ');
    }
  });
});
