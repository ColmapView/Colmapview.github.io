import { describe, expect, it, vi } from 'vitest';
import { publicationAssetSummary, summarizePublicationAssets } from './publicationSummary';
import type { PreparedPublication, PublishAsset } from './types';

function prepared(): PreparedPublication {
  const file = (path: string, kind: PublishAsset['kind']): PublishAsset => ({ path, kind, size: null, open: vi.fn() });
  return { operationId: 'operation', sourceKey: 'source', modelRevision: 0,
    counts: { cameras: 2, images: 99, points: 1000 },
    viewerState: { version: 1, viewerVersion: 'test', viewState: null, config: {} },
    imageNameToPath: {}, splatPaths: ['selected.spz', 'unselected.spz'], viewerBaseUrl: 'https://colmapview.opsiclear.com/',
    assets: [file('cameras.bin', 'colmap'), file('images.bin', 'colmap'), file('points3D.bin', 'colmap'),
      file('rigs.bin', 'colmap'), file('frames.bin', 'colmap'), file('one.jpg', 'image'), file('two.png', 'image'),
      file('one.jpg.png', 'mask'), file('selected.spz', 'splat'), file('colmapview.yaml', 'viewer-state'), file('cover.png', 'preview')],
  };
}

describe('published asset summaries', () => {
  it('counts the prepared inventory rather than the source catalog or model image count, without opening files', () => {
    const input = prepared();
    expect(publicationAssetSummary(input)).toEqual({ format: 'folder', imageFormat: 'original',
      colmap: { files: 5, cameras: 2, points: 1000 }, images: 2, masks: 1, splats: 1, viewerSettings: true, preview: true });
    input.assets.forEach(asset => expect(asset.open).not.toHaveBeenCalled());
  });

  it('distinguishes JPEG ZIP encoding and explicitly represents absent optional assets', () => {
    const input = prepared();
    input.imageFormat = 'jpeg';
    input.assets = input.assets.filter(asset => asset.kind === 'colmap' || asset.kind === 'image');
    expect(summarizePublicationAssets(input, 'zip')).toEqual({ format: 'zip', imageFormat: 'jpeg',
      colmap: { files: 5, cameras: 2, points: 1000 }, images: 2, masks: 0, splats: 0, viewerSettings: false, preview: false });
    expect(summarizePublicationAssets(input, 'folder').imageFormat).toBe('original');
  });

  it('keeps the inner ZIP inventory and does not guess counts for an older external archive', () => {
    const input = prepared();
    const summary = summarizePublicationAssets(input, 'zip');
    input.archive = { path: 'dataset.zip', size: 1000, files: [], summary };
    input.assets = [{ path: 'dataset.zip', kind: 'archive', size: 1000, open: vi.fn() }];
    expect(publicationAssetSummary(input)).toEqual(summary);
    delete input.archive.summary;
    expect(publicationAssetSummary(input)).toBeUndefined();
  });
});
