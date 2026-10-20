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
  const geometry = { url: 'https://example.com/frames.tar.zst', bytes: 5000000000, format: 'tar.zst', role: 'points3D',
    member: { path: 'frame.ply', bytes: 100, sha256: 'a'.repeat(64) }, prefix: { bytes: 1024, sha256: 'b'.repeat(64) } };
  const frameManifest = { version: 3, baseUrl: manifest.baseUrl, files: { cameras: 'cameras.bin', images: 'images.bin' }, geometryFiles: [geometry] };
  it('accepts a bounded archived frame alongside old media archive layouts', () => {
    expect(validateColmapManifest(frameManifest).success).toBe(true);
    expect(validateColmapManifest({ ...frameManifest, mediaArchives: [{ url: 'https://example.com/photos.zip', bytes: 5000, mountPath: 'images' }] }).success).toBe(true);
  });
  it('rejects unsafe, ambiguous, oversized and mismatched archive frame declarations', () => {
    for (const file of [
      { ...geometry, url: 'https://]' }, { ...geometry, url: 'file:///frames.tar.zst' },
      { ...geometry, member: { ...geometry.member, path: '../frame.ply' } },
      { ...geometry, member: { ...geometry.member, bytes: 65 * 1024 * 1024 } },
      { ...geometry, member: { ...geometry.member, sha256: 'not-a-hash' } },
      { ...geometry, prefix: undefined }, { ...geometry, prefix: { ...geometry.prefix, bytes: 17 * 1024 * 1024 } },
      { ...geometry, bytes: 100 }, { ...geometry, format: 'zip' },
    ]) expect(validateColmapManifest({ ...frameManifest, geometryFiles: [file] }).success).toBe(false);
    expect(validateColmapManifest({ ...frameManifest, version: 1 }).success).toBe(false);
    expect(validateColmapManifest({ ...frameManifest, files: manifest.files }).success).toBe(false);
    expect(validateColmapManifest({ ...frameManifest, geometryFiles: [geometry, geometry] }).success).toBe(false);
    expect(validateColmapManifest({ ...frameManifest, splats: ['cloud.ply'], geometryFiles: [{ ...geometry, role: 'splat' }] }).success).toBe(false);
  });
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
