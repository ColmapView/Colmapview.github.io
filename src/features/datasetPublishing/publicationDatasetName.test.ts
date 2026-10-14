import { describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store';
import { getPublicationDatasetName, PUBLICATION_DATASET_NAME_MAX } from './publicationSnapshot';
import type { ColmapManifest } from '../../types/manifest';

const state = (patch: Partial<ReturnType<typeof useReconstructionStore.getState>>) => ({ ...useReconstructionStore.getInitialState(), ...patch });

describe('getPublicationDatasetName', () => {
  it('prefers the manifest name', () => {
    expect(getPublicationDatasetName(state({ sourceManifest: { name: 'Garden scan' } as ColmapManifest, sourceUrl: 'https://data.example/x/scene.zip' }))).toBe('Garden scan');
  });

  it('uses the name recorded from a URL-loaded manifest before the URL segment', () => {
    // URL manifests are not stored in the state; their loader records the manifest name instead.
    expect(getPublicationDatasetName(state({ sourceType: 'url', sourceUrl: 'https://bucket.example/d/1/manifest.json', sourceName: 'Garden scan' }))).toBe('Garden scan');
    expect(getPublicationDatasetName(state({ sourceType: 'url', sourceUrl: 'https://data.example/garden_manifest.json', sourceName: 'Garden scan' }))).toBe('Garden scan');
  });

  it('uses the source URL\'s last segment without an archive or JSON extension, skipping generic names', () => {
    expect(getPublicationDatasetName(state({ sourceUrl: 'https://data.example/sets/garden.zip' }))).toBe('garden');
    expect(getPublicationDatasetName(state({ sourceUrl: 'https://data.example/sets/scene.tar.gz' }))).toBe('scene');
    expect(getPublicationDatasetName(state({ sourceUrl: 'https://data.example/sets/scan_2024.10.01/' }))).toBe('scan_2024.10.01');
    expect(getPublicationDatasetName(state({ sourceUrl: 'https://huggingface.co/datasets/user/my%20scene' }))).toBe('my scene');
    expect(getPublicationDatasetName(state({ sourceUrl: 'https://drive.google.com/file/d/abc/view', sourceName: 'from-drop' }))).toBe('from-drop');
    expect(getPublicationDatasetName(state({ sourceUrl: 'https://bucket.example/d/1/manifest.json' }))).toBe('colmap-dataset');
  });

  it('falls back to the recorded local name, then colmap-dataset', () => {
    expect(getPublicationDatasetName(state({ sourceName: 'garden' }))).toBe('garden');
    expect(getPublicationDatasetName(state({}))).toBe('colmap-dataset');
  });

  it('removes path separators', () => {
    expect(getPublicationDatasetName(state({ sourceManifest: { name: 'a/b\\c' } as ColmapManifest }))).toBe('a-b-c');
  });

  it('replaces control characters and collapses whitespace', () => {
    expect(getPublicationDatasetName(state({ sourceUrl: 'https://data.example/sets/a%0Ab%7F%09c.zip' }))).toBe('a b c');
    expect(getPublicationDatasetName(state({ sourceManifest: { name: `  Garden${String.fromCharCode(0)}\n\n scan  ` } as ColmapManifest }))).toBe('Garden scan');
  });

  it('treats dot-only and blank names as no name and falls through', () => {
    expect(getPublicationDatasetName(state({ sourceManifest: { name: '..' } as ColmapManifest, sourceName: 'garden' }))).toBe('garden');
    expect(getPublicationDatasetName(state({ sourceManifest: { name: String.fromCharCode(1, 2) } as ColmapManifest, sourceUrl: 'https://data.example/%2E%2E' }))).toBe('colmap-dataset');
  });

  it('caps the name so the Drive file name with .zip fits 180 characters', () => {
    expect(PUBLICATION_DATASET_NAME_MAX).toBe(176);
    expect(getPublicationDatasetName(state({ sourceName: 'x'.repeat(300) }))).toBe('x'.repeat(176));
    // A cut never splits a surrogate pair.
    const name = getPublicationDatasetName(state({ sourceName: `${'x'.repeat(175)}\u{1F600}` }));
    expect(name).toBe('x'.repeat(175));
  });
});
