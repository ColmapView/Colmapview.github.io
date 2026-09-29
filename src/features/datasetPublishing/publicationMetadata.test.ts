import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchManifestColmapFiles } from '../../hooks/urlLoaderManifestFetch';
import { getManifestLoadSourceInfo } from '../../hooks/urlLoaderPolicy';
import { buildImageUrl } from '../../utils/imageFileLookupPolicy';
import { getPublicationViewerBaseUrl, publicationManifest, publicationMetadata, publicationReceipt, validatePublicationDetails } from './publicationMetadata';
import { datasetFileUrl } from './publicationPaths';
import type { PreparedPublication } from './types';

const DATA_COMMIT = 'd'.repeat(40);
const TILE_BYTES = 400_000_000;

function prepared(splatPaths: string[]): PreparedPublication {
  const colmap = ['cameras.bin', 'images.bin', 'points3D.bin'].map(name => ({ path: `sparse/0/${name}`, kind: 'colmap' as const, size: 1,
    open: async () => new Blob(['x']) }));
  return { operationId: 'operation', sourceKey: 'source', modelRevision: 1, counts: { cameras: 1, images: 1, points: 1 },
    assets: colmap, imageNameToPath: {}, splatPaths, viewerBaseUrl: 'https://viewer.example/',
    viewerState: { version: 1, viewerVersion: 'test', viewState: null, config: { splat: { activeSourceId: splatPaths[0] } } } };
}

describe('publication receipt', () => {
  it('shares the viewer followed by the Hugging Face dataset page', () => {
    const receipt = publicationReceipt(prepared([]), 'owner/scene', DATA_COMMIT, 'e'.repeat(40));
    expect(receipt.viewerUrl).toBe('https://viewer.example/?url=https://huggingface.co/datasets/owner/scene');
    expect(new URL(receipt.viewerUrl).searchParams.get('url')).toBe('https://huggingface.co/datasets/owner/scene');
  });
});

describe('publication viewer base', () => {
  it.each([
    ['https://colmapview.github.io', '/v0.15.2/', 'https://colmapview.github.io/latest/'],
    ['https://colmapview.github.io', '/latest/', 'https://colmapview.github.io/latest/'],
    ['https://colmapview.github.io', '/dev/', 'https://colmapview.github.io/dev/'],
    ['http://localhost:5173', '/', 'http://localhost:5173/'],
  ])('links %s%s datasets to %s', (origin, pathname, expected) => {
    const { hostname } = new URL(origin);
    expect(getPublicationViewerBaseUrl({ origin, hostname, pathname })).toBe(expected);
  });
});

describe('dataset card', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('links the viewer to the dataset page, the same clean link the dialog shares', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const checked = validatePublicationDetails({ name: 'scene', title: 'Scene', description: '', license: 'cc-by-4.0' });
    const readme = await publicationMetadata(prepared([]), checked, 'owner/scene', DATA_COMMIT, [])
      .find(file => file.path === 'README.md')!.content.text();
    const link = 'https://viewer.example/?url=https://huggingface.co/datasets/owner/scene';
    expect(readme).toContain(`[Open in ColmapView](${link})`);
    expect(readme).toContain(`Viewer link: <${link}>`);
    expect(readme).not.toContain('Direct viewer URL');
    // Hugging Face would otherwise convert images/ to Parquet and show them as a table on the dataset page.
    expect(readme).toMatch(/^---\n[\s\S]*^viewer: false$[\s\S]*^---$/m);
    expect(readme).not.toMatch(/\?url=https%3A|#manifest=|[?&]m=/);
  });
});

describe('dataset card license', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['cc-by-nc-4.0', 'cc-by-nc-sa-4.0', 'cc-by-nd-4.0', 'cc-by-nc-nd-4.0'])('publishes the %s license identifier', async license => {
    vi.stubGlobal('Blob', NodeBlob);
    const checked = validatePublicationDetails({ name: 'scene', title: 'Scene', description: '', license });
    const readme = publicationMetadata(prepared([]), checked, 'owner/scene', DATA_COMMIT, []).find(file => file.path === 'README.md')!;
    expect(await readme.content.text()).toContain(`license: ${license}\n`);
  });
});

describe('published manifest', () => {
  it('lists only image paths the viewer cannot derive while every image still resolves to its upload', () => {
    const names = ['a.jpg', 'nested/b#1.jpg', 'dir\\c.jpg', 'images/d.jpg', 'Images/e.jpg'];
    const uploaded = Object.fromEntries(names.map(name => [name, `images/${name.replace(/\\/g, '/')}`]));
    const manifest = publicationManifest({ ...prepared([]), imageNameToPath: uploaded }, 'owner/scene', DATA_COMMIT, 'Scene');
    expect(Object.keys(manifest.imageNameToPath ?? {})).toEqual(['images/d.jpg', 'Images/e.jpg']);
    const viewer = getManifestLoadSourceInfo(manifest, { type: 'manifest' });
    for (const name of names) {
      const url = viewer.imageNameToUrl?.[name] || buildImageUrl(viewer.imageUrlBase!, name).url;
      expect(url).toBe(datasetFileUrl('owner/scene', DATA_COMMIT, uploaded[name]));
    }
  });

  it('leaves published splats to the size-limited lazy catalog instead of downloading every tile up front', async () => {
    const manifest = publicationManifest(prepared(['splats/tile-a.ply', 'splats/tile-b.ply']), 'owner/scene', DATA_COMMIT, 'Scene');
    const tree = [
      { type: 'file', path: 'sparse/0/cameras.bin', size: 1 },
      { type: 'file', path: 'sparse/0/images.bin', size: 1 },
      { type: 'file', path: 'sparse/0/points3D.bin', size: 1 },
      { type: 'file', path: 'splats/tile-a.ply', size: TILE_BYTES },
      { type: 'file', path: 'splats/tile-b.ply', size: TILE_BYTES },
    ];
    const fetchImpl = vi.fn(async (url: string) => url.startsWith(`https://huggingface.co/api/datasets/owner/scene/tree/${DATA_COMMIT}`)
      ? new Response(JSON.stringify(tree), { headers: { 'Content-Type': 'application/json' } })
      : new Response(null, { status: 404 }));
    const fetchFile = vi.fn(async (_baseUrl: string, path: string) => new File(['x'], path.split('/').pop()!));
    const onRemoteSplatCatalog = vi.fn();

    const files = await fetchManifestColmapFiles(manifest, { fetchImpl, fetchFile, setUrlProgress: vi.fn(), onRemoteSplatCatalog,
      classifySplatUrl: async () => ({ isSplat: true, splatCount: null }), isTouchDevice: false });

    expect(fetchFile.mock.calls.map(([, path]) => path).filter(path => path.startsWith('splats/'))).toEqual([]);
    expect([...files.keys()].some(key => key.startsWith('splats/'))).toBe(false);
    expect(onRemoteSplatCatalog).toHaveBeenCalledWith([
      expect.objectContaining({ path: 'splats/tile-a.ply', size: TILE_BYTES }),
      expect.objectContaining({ path: 'splats/tile-b.ply', size: TILE_BYTES }),
    ]);
  });
});
