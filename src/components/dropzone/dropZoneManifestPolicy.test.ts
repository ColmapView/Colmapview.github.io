import { describe, expect, it } from 'vitest';
import { createExampleManifest, parseManifestContent } from './dropZoneManifestPolicy';

describe('drop zone manifest policy', () => {
  it('builds the downloadable example manifest', () => {
    expect(createExampleManifest()).toEqual({
      version: 1,
      name: 'Example Dataset',
      baseUrl: 'https://example.com/colmap-data',
      files: {
        cameras: 'sparse/0/cameras.bin',
        images: 'sparse/0/images.bin',
        points3D: 'sparse/0/points3D.bin',
      },
      imagesPath: 'images/',
      masksPath: 'masks/',
    });
  });

  it('parses valid manifest JSON', () => {
    const result = parseManifestContent(JSON.stringify(createExampleManifest()));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.manifest.files.cameras).toBe('sparse/0/cameras.bin');
    }
  });

  it('reports schema validation errors', () => {
    const result = parseManifestContent(JSON.stringify({
      version: 1,
      baseUrl: 'not-a-url',
      files: {
        cameras: '',
        images: 'images.bin',
        points3D: 'points3D.bin',
      },
    }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorMessage).toContain('Invalid manifest:');
      expect(result.errorMessage).toContain('baseUrl');
      expect(result.errorMessage).toContain('files.cameras');
    }
  });

  it('reports malformed JSON as a manifest load failure', () => {
    const result = parseManifestContent('{');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorMessage).toMatch(/^Failed to load manifest:/);
    }
  });
});
