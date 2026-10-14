import { describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store';
import { getPublicationDatasetName } from './publicationSnapshot';
import type { ColmapManifest } from '../../types/manifest';

const state = (patch: Partial<ReturnType<typeof useReconstructionStore.getState>>) => ({ ...useReconstructionStore.getInitialState(), ...patch });

describe('getPublicationDatasetName', () => {
  it('prefers the manifest name', () => {
    expect(getPublicationDatasetName(state({ sourceManifest: { name: 'Garden scan' } as ColmapManifest, sourceUrl: 'https://data.example/x/scene.zip' }))).toBe('Garden scan');
  });

  it('uses the source URL\'s last segment without its extension, skipping generic names', () => {
    expect(getPublicationDatasetName(state({ sourceUrl: 'https://data.example/sets/garden.zip' }))).toBe('garden');
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
});
