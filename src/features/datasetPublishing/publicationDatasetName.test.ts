import { describe, expect, it } from 'vitest';
import { getPublicationDatasetName, PUBLICATION_DATASET_NAME_MAX } from './publicationDatasetName';
import { bucketFolder } from '../bucketStorage/paths';

describe('getPublicationDatasetName', () => {
  it('prefers the manifest name', () => {
    expect(getPublicationDatasetName({ sourceManifest: { name: 'Garden scan' }, sourceUrl: 'https://data.example/x/scene.zip' })).toBe('Garden scan');
  });

  it('uses the name recorded from a URL-loaded manifest before the URL segment', () => {
    // URL manifests are not stored in the state; their loader records the manifest name instead.
    expect(getPublicationDatasetName({ sourceUrl: 'https://bucket.example/d/1/manifest.json', sourceName: 'Garden scan' })).toBe('Garden scan');
    expect(getPublicationDatasetName({ sourceUrl: 'https://data.example/garden_manifest.json', sourceName: 'Garden scan' })).toBe('Garden scan');
  });

  it('uses the source URL\'s last segment without an archive or JSON extension, skipping generic names', () => {
    expect(getPublicationDatasetName({ sourceUrl: 'https://data.example/sets/garden.zip' })).toBe('garden');
    expect(getPublicationDatasetName({ sourceUrl: 'https://data.example/sets/scene.tar.gz' })).toBe('scene');
    expect(getPublicationDatasetName({ sourceUrl: 'https://data.example/sets/scan_2024.10.01/' })).toBe('scan_2024.10.01');
    expect(getPublicationDatasetName({ sourceUrl: 'https://huggingface.co/datasets/user/my%20scene' })).toBe('my scene');
    expect(getPublicationDatasetName({ sourceUrl: 'https://drive.google.com/file/d/abc/view', sourceName: 'from-drop' })).toBe('from-drop');
    expect(getPublicationDatasetName({ sourceUrl: 'https://bucket.example/d/1/manifest.json' })).toBe('colmap-dataset');
  });

  it('falls back to the recorded local name, then colmap-dataset', () => {
    expect(getPublicationDatasetName({ sourceName: 'garden' })).toBe('garden');
    expect(getPublicationDatasetName({})).toBe('colmap-dataset');
  });

  it('removes path separators', () => {
    expect(getPublicationDatasetName({ sourceManifest: { name: 'a/b\\c' } })).toBe('a-b-c');
  });

  it('replaces control characters and collapses whitespace', () => {
    expect(getPublicationDatasetName({ sourceUrl: 'https://data.example/sets/a%0Ab%7F%09c.zip' })).toBe('a b c');
    expect(getPublicationDatasetName({ sourceManifest: { name: `  Garden${String.fromCharCode(0)}\n\n scan  ` } })).toBe('Garden scan');
  });

  it('treats dot-only and blank names as no name and falls through', () => {
    expect(getPublicationDatasetName({ sourceManifest: { name: '..' }, sourceName: 'garden' })).toBe('garden');
    expect(getPublicationDatasetName({ sourceManifest: { name: String.fromCharCode(1, 2) }, sourceUrl: 'https://data.example/%2E%2E' })).toBe('colmap-dataset');
  });

  it('caps the name so the Drive file name with .zip fits 180 characters', () => {
    expect(PUBLICATION_DATASET_NAME_MAX).toBe(176);
    expect(getPublicationDatasetName({ sourceName: 'x'.repeat(300) })).toBe('x'.repeat(176));
    // A cut never splits a surrogate pair.
    const name = getPublicationDatasetName({ sourceName: `${'x'.repeat(175)}\u{1F600}` });
    expect(name).toBe('x'.repeat(175));
  });

  it('caps the name at 512 UTF-8 bytes so the default bucket folder fits, cutting between characters', () => {
    const cjk = getPublicationDatasetName({ sourceName: '庭'.repeat(176) });
    expect(cjk).toBe('庭'.repeat(170));
    expect(new TextEncoder().encode(cjk).byteLength).toBeLessThanOrEqual(512);
    expect(() => bucketFolder(cjk)).not.toThrow();
    // 170 three-byte characters use 510 bytes: a two-byte character still fits, the next byte does not.
    expect(getPublicationDatasetName({ sourceName: `${'庭'.repeat(170)}éz` })).toBe(`${'庭'.repeat(170)}é`);
    // A four-byte emoji past the cap is dropped whole, never split.
    expect(getPublicationDatasetName({ sourceName: `${'庭'.repeat(170)}\u{1F600}` })).toBe('庭'.repeat(170));
  });

  it('counts a lone surrogate as the three bytes of its replacement character', () => {
    const lone = getPublicationDatasetName({ sourceName: '\ud800'.repeat(171) });
    expect(lone).toHaveLength(170);
    expect(new TextEncoder().encode(lone).byteLength).toBe(510);
  });
});
