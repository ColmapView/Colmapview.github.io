import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverManifestSplatCatalog, fetchManifestColmapFiles } from '../../hooks/urlLoaderManifestFetch';
import { getManifestLoadSourceInfo } from '../../hooks/urlLoaderPolicy';
import { buildImageUrl } from '../../utils/imageFileLookupPolicy';
import { PUBLICATION_LICENSES, publicationLicenseInfo, publicationManifest, publicationMetadata, publicationReceipt, stripControlCharacters, validatePublicationDetails } from './publicationMetadata';
import { datasetFileUrl } from './publicationPaths';
import { bucketPublicationManifest } from '../bucketStorage/publishDataset';
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
  it('pins ZIP links to the uploaded data revision instead of treating the repository as a loose folder', () => {
    const input = prepared([]);
    input.archive = { path: 'dataset.zip', size: 100, files: [{ path: 'sparse/0/cameras.bin', size: 1 }] };
    const receipt = publicationReceipt(input, 'owner/scene', DATA_COMMIT, 'e'.repeat(40), 'private');
    expect(new URL(receipt.viewerUrl).searchParams.get('url')).toBe(datasetFileUrl('owner/scene', DATA_COMMIT, 'dataset.zip'));
    expect(receipt.repoUrl).toBe('https://huggingface.co/datasets/owner/scene');
    expect(receipt.visibility).toBe('private');
    expect(receipt.assets).toBeUndefined();
  });
  it('shares the viewer followed by the Hugging Face dataset page', () => {
    const receipt = publicationReceipt(prepared([]), 'owner/scene', DATA_COMMIT, 'e'.repeat(40), 'public');
    expect(receipt.viewerUrl).toBe('https://viewer.example/?url=https://huggingface.co/datasets/owner/scene');
    expect(new URL(receipt.viewerUrl).searchParams.get('url')).toBe('https://huggingface.co/datasets/owner/scene');
    expect(receipt.assets).toEqual({ format: 'folder', imageFormat: 'original', colmap: { files: 3, cameras: 1, points: 1 },
      images: 0, masks: 0, splats: 0, viewerSettings: false, preview: false });
  });
});

describe('dataset card', () => {
  it('uses the trimmed repository name as the README and manifest title', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const checked = validatePublicationDetails({ name: '  scene_01  ', description: '', license: '', visibility: 'public' });
    const files = publicationMetadata(prepared([]), checked, 'owner/scene_01', DATA_COMMIT, []);
    const readme = await files.find(file => file.path === 'README.md')!.content.text();
    expect(readme).toContain('\n# scene\\_01\n');
    const manifest = JSON.parse(await files.find(file => file.path === 'colmapview.json')!.content.text());
    expect(manifest.name).toBe('scene_01');
  });

  it('describes JPEG copies accurately and rejects the conversion for loose Folder uploads', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const input = prepared([]); input.imageFormat = 'jpeg'; input.archive = { path: 'dataset.zip', size: 100, files: [] };
    const details = { name: 'scene', description: '', license: '', visibility: 'private' as const,
      format: 'zip' as const, imageFormat: 'jpeg' as const };
    expect(validatePublicationDetails(details).imageFormat).toBe('jpeg');
    expect(() => validatePublicationDetails({ ...details, format: 'folder' })).toThrow('requires ZIP');
    const files = publicationMetadata(input, details, 'owner/scene', DATA_COMMIT, []);
    const card = await files[0].content.text();
    expect(card).toContain('Full-resolution JPEG image copies (85% quality, without image metadata)');
    expect(card).not.toContain('Original images are in images/');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('documents ZIP contents and uses the same pinned link without publishing a broken loose-file manifest', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const input = prepared(['splats/scene.sog']);
    input.archive = { path: 'dataset.zip', size: 100, files: [{ path: 'masks/photo.jpg.png', size: 4 }] };
    const details = { name: 'scene', description: '', license: '', visibility: 'private' as const, format: 'zip' as const };
    const inventory = [{ path: 'dataset.zip', size: 100 }];
    const files = publicationMetadata(input, details, 'owner/scene', DATA_COMMIT, inventory);
    expect(files.map(file => file.path)).toEqual(['README.md', 'colmapview-inventory.json']);
    const readme = await files[0].content.text();
    const receipt = publicationReceipt(input, 'owner/scene', DATA_COMMIT, 'e'.repeat(40), 'private');
    expect(readme).toContain(`[Open in ColmapView](${receipt.viewerUrl})`);
    expect(readme).toContain(`[dataset.zip](${datasetFileUrl('owner/scene', DATA_COMMIT, 'dataset.zip')})`);
    expect(readme).toContain('1 masks and 1 original splat files');
    expect(readme).toContain('Private dataset. Sign in');
    expect(JSON.parse(await files[1].content.text())).toMatchObject({ dataCommit: DATA_COMMIT, files: inventory, archive: input.archive });
  });

  it('links the viewer to the dataset page, the same clean link the dialog shares', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const checked = validatePublicationDetails({ name: 'scene', description: '', license: 'cc-by-4.0', visibility: 'public' });
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

  it.each(['public', 'private'] as const)('allows a %s upload without granting a license', async visibility => {
    vi.stubGlobal('Blob', NodeBlob);
    const checked = validatePublicationDetails({ name: 'scene', description: '', license: '', visibility });
    const readme = await publicationMetadata(prepared([]), checked, 'owner/scene', DATA_COMMIT, []).find(file => file.path === 'README.md')!.content.text();
    expect(readme).not.toMatch(/^license(?:_name|_link)?:/m);
    expect(readme.includes('Private dataset. Sign in to Hugging Face')).toBe(visibility === 'private');
    const receipt = publicationReceipt(prepared([]), 'owner/scene', DATA_COMMIT, 'e'.repeat(40), visibility);
    expect(receipt.visibility).toBe(visibility);
    expect(receipt.viewerUrl).toBe('https://viewer.example/?url=https://huggingface.co/datasets/owner/scene');
  });

  it.each(['public', 'private'] as const)('rejects an unknown license for a %s dataset', visibility => {
    expect(() => validatePublicationDetails({ name: 'scene', description: '', license: 'unknown', visibility })).toThrow('Choose the license');
  });

  it.each(['cc-by-nc-4.0', 'cc-by-nc-sa-4.0', 'cc-by-nd-4.0', 'cc-by-nc-nd-4.0'])('publishes the %s license identifier', async license => {
    vi.stubGlobal('Blob', NodeBlob);
    const checked = validatePublicationDetails({ name: 'scene', description: '', license, visibility: 'public' });
    const readme = publicationMetadata(prepared([]), checked, 'owner/scene', DATA_COMMIT, []).find(file => file.path === 'README.md')!;
    expect(await readme.content.text()).toContain(`license: ${license}\n`);
  });
});

describe('published manifest', () => {
  it.each([
    { optional: [] }, { optional: ['rigs'] }, { optional: ['frames'] }, { optional: ['rigs', 'frames'] },
  ])('keeps HF and bucket model layouts aligned with optional files: $optional', ({ optional }) => {
    const input = prepared(['splats/scene.sog']);
    for (const name of optional) input.assets.push({ path: `sparse/0/${name}.bin`, kind: 'colmap', size: 1, open: async () => new Blob(['x']) });
    // A similarly named non-model file must not create a model-file reference.
    input.assets.push({ path: 'images/rigs.bin', kind: 'image', size: 1, open: async () => new Blob(['x']) });
    const hf = publicationManifest(input, 'owner/scene', DATA_COMMIT, 'Scene');
    const bucket = bucketPublicationManifest(input, 'https://bucket.example/scene/', 'Scene');
    const expected = { cameras: 'sparse/0/cameras.bin', images: 'sparse/0/images.bin', points3D: 'sparse/0/points3D.bin',
      ...Object.fromEntries(optional.map(name => [name, `sparse/0/${name}.bin`])) };
    expect(hf.files).toEqual(expected);
    expect(bucket.files).toEqual(expected);
    expect(hf.splats).toBeUndefined();
    expect(bucket.splats).toEqual(input.splatPaths);
    expect(hf.masksPath).toBe('masks/');
    expect(bucket.masksPath).toBeUndefined();
  });
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

    const files = await fetchManifestColmapFiles(manifest, { fetchImpl, fetchFile, setUrlProgress: vi.fn(), log: vi.fn() });
    expect(fetchImpl).not.toHaveBeenCalled();
    const catalog = await discoverManifestSplatCatalog(manifest, { fetchImpl,
      classifySplatUrl: async () => ({ isSplat: true, splatCount: null }), log: vi.fn() });

    expect(fetchFile.mock.calls.map(([, path]) => path).filter(path => path.startsWith('splats/'))).toEqual([]);
    expect([...files.keys()].some(key => key.startsWith('splats/'))).toBe(false);
    expect(catalog).toEqual([
      expect.objectContaining({ path: 'splats/tile-a.ply', size: TILE_BYTES }),
      expect.objectContaining({ path: 'splats/tile-b.ply', size: TILE_BYTES }),
    ]);
  });
});

describe('license names, links and form text rules', () => {
  it('gives every known license a short name and an HTTPS link', () => {
    for (const option of PUBLICATION_LICENSES.filter(option => option.id !== 'other')) {
      expect(publicationLicenseInfo({ license: option.id })).toEqual({ name: expect.any(String), url: expect.stringMatching(/^https:\/\//) });
    }
    expect(publicationLicenseInfo({ license: 'cc-by-4.0' })).toEqual({ name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' });
  });

  it('uses the entered custom license, and nothing when there is no license', () => {
    expect(publicationLicenseInfo({ license: 'other', licenseName: ' Research only ', licenseUrl: 'https://example.com/l' }))
      .toEqual({ name: 'Research only', url: 'https://example.com/l' });
    expect(publicationLicenseInfo({ license: '' })).toBeUndefined();
  });

  it('strips control characters, keeping line breaks and tabs only in multi-line fields', () => {
    expect(stripControlCharacters('Sce\u0000ne\u0007\n')).toBe('Scene');
    expect(stripControlCharacters('Line\u0000 one\n\ttwo\r\n', true)).toBe('Line one\n\ttwo\r\n');
  });

  it('turns a pasted tab into a space in single-line fields', () => {
    expect(stripControlCharacters('Coral\treef')).toBe('Coral reef');
  });

  it('caps a custom license name at 160 characters and its URL at 2048, like the Hub', () => {
    const details = { name: 'scene', description: '', license: 'other', visibility: 'public' as const, licenseUrl: 'https://example.com/l' };
    expect(() => validatePublicationDetails({ ...details, licenseName: 'L'.repeat(160) })).not.toThrow();
    expect(() => validatePublicationDetails({ ...details, licenseName: 'L'.repeat(161) })).toThrow('Shorten the custom license name to 160 characters and its URL to 2,048.');
    expect(() => validatePublicationDetails({ ...details, licenseName: 'Custom', licenseUrl: `https://example.com/${'a'.repeat(2048)}` }))
      .toThrow('Shorten the custom license name to 160 characters and its URL to 2,048.');
  });

  it('caps the normalized license URL too, which percent-encoding lengthens', () => {
    const licenseUrl = `https://example.com/${'€'.repeat(300)}`;
    expect(licenseUrl.length).toBeLessThanOrEqual(2048);
    expect(new URL(licenseUrl).href.length).toBeGreaterThan(2048);
    expect(() => validatePublicationDetails({ name: 'scene', description: '', license: 'other', visibility: 'public', licenseName: 'Custom', licenseUrl }))
      .toThrow('Shorten the custom license name to 160 characters and its URL to 2,048.');
  });
});
