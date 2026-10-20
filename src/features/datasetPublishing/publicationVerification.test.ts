import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHubClient } from '../huggingface/hubClient';
import { serializeDatasetViewerSettings } from '../../utils/datasetViewerSettings';
import { publicationManifest, publicationMetadata, publicationReceipt } from './publicationMetadata';
import { packageZipPublication } from './packagePublicationZip';
import { createPublicationVerifier } from './publicationVerification';
import type { PreparedPublication, PublicationVisibility } from './types';

const sdk = vi.hoisted(() => ({ datasetInfo: vi.fn(), listFiles: vi.fn() }));
vi.mock('@huggingface/hub', () => sdk);
const repoId = 'owner/scene';
const dataCommit = 'd'.repeat(40);
const metadataCommit = 'e'.repeat(40);

beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('Blob', NodeBlob); });
afterEach(() => { vi.unstubAllGlobals(); });

function setup(visibility: PublicationVisibility, requireToken = visibility === 'private') {
  const prepared: PreparedPublication = { operationId: 'operation', sourceKey: 'source', modelRevision: 1,
    counts: { cameras: 1, images: 1, points: 1 }, imageNameToPath: { 'photo.jpg': 'images/photo.jpg' }, splatPaths: [],
    viewerBaseUrl: 'https://viewer.example/', previewPath: 'preview.png',
    viewerState: { version: 1, viewerVersion: 'test', viewState: null, config: {} }, assets: [] };
  const contents = new Map([
    ['sparse/0/cameras.bin', 'c'], ['sparse/0/images.bin', 'i'], ['sparse/0/points3D.bin', 'p'],
    ['images/photo.jpg', 'jpeg'], ['preview.png', 'png'], ['colmapview.yaml', serializeDatasetViewerSettings(prepared.viewerState)],
  ]);
  prepared.assets = [...contents].map(([path, content]) => ({ path, size: content.length,
    kind: path.startsWith('images/') ? 'image' : path === 'preview.png' ? 'preview' : path === 'colmapview.yaml' ? 'viewer-state' : 'colmap',
    open: async () => new Blob([content]) }));
  const inventory = prepared.assets.map(({ path, size }) => ({ path, size: size! }));
  sdk.datasetInfo.mockResolvedValue({ private: visibility === 'private', gated: false });
  sdk.listFiles.mockImplementation(async function* () {
    for (const file of inventory) yield { ...file, type: 'file', oid: 'a'.repeat(40) };
  });
  const manifest = publicationManifest(prepared, repoId, dataCommit, 'Scene');
  const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (requireToken && new Headers(init?.headers).get('Authorization') !== 'Bearer test-token') return new Response('Private', { status: 404 });
    const path = url.split('/resolve/')[1]?.split('/').slice(1).join('/');
    const content = path === 'colmapview.json' ? JSON.stringify(manifest) : contents.get(path ?? '');
    return content === undefined ? new Response('Missing', { status: 404 }) : new Response(content);
  });
  vi.stubGlobal('fetch', request);
  const client = createHubClient(() => 'test-token');
  const receipt = publicationReceipt(prepared, repoId, dataCommit, metadataCommit, visibility);
  return { verify: () => createPublicationVerifier(client)(receipt, prepared, inventory, new AbortController().signal), request, client, prepared, manifest };
}

async function setupZip(visibility: PublicationVisibility, corruptInventory = false) {
  const { client, prepared, request } = setup(visibility);
  const signal = new AbortController().signal;
  const zipped = await packageZipPublication(prepared, signal, () => {}, () => {}, { repositorySidecars: true });
  const inventory = zipped.assets.map(asset => ({ path: asset.path, size: asset.size! }));
  const blobs = new Map<string, Blob>();
  for (const asset of zipped.assets) blobs.set(asset.path, await asset.open(signal));
  for (const file of publicationMetadata(zipped, { name: 'scene', description: '', license: visibility === 'public' ? 'cc0-1.0' : '', visibility },
    repoId, dataCommit, inventory)) blobs.set(file.path, file.content);
  if (corruptInventory) {
    const document = JSON.parse(await blobs.get('colmapview-inventory.json')!.text());
    document.archive.files = [];
    blobs.set('colmapview-inventory.json', new Blob([JSON.stringify(document)]));
  }
  sdk.listFiles.mockImplementation(async function* () {
    for (const file of inventory) yield { ...file, type: 'file', oid: 'a'.repeat(40) };
  });
  request.mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe(visibility === 'private' ? 'Bearer test-token' : null);
    const path = url.split('/resolve/')[1]?.split('/').slice(1).join('/') ?? '';
    const blob = blobs.get(path);
    if (!blob) return new Response('Missing', { status: 404 });
    if (init?.method === 'HEAD') return new Response(null, { headers: { 'Content-Length': String(blob.size) } });
    if (path === 'dataset.zip') return new Response(await blob.slice(0, 4).arrayBuffer(), { status: 206 });
    return new Response(await blob.arrayBuffer());
  });
  const receipt = publicationReceipt(zipped, repoId, dataCommit, metadataCommit, visibility);
  return { verify: () => createPublicationVerifier(client)(receipt, zipped, inventory, signal), request };
}

describe('Hugging Face publication verification', () => {
  it.each(['model path', 'data revision', 'settings path'] as const)('rejects invalid Folder metadata before requesting settings: %s', async fault => {
    const { verify, request, manifest } = setup('private');
    if (fault === 'model path') manifest.files.cameras = '';
    if (fault === 'data revision') manifest.baseUrl = manifest.baseUrl.replace(dataCommit, 'f'.repeat(40));
    if (fault === 'settings path') manifest.viewerStatePath = 'wrong.yaml';
    await expect(verify()).rejects.toThrow('published viewer manifest could not be verified');
    expect(request.mock.calls.every(([url]) => String(url).endsWith('/colmapview.json'))).toBe(true);
  });

  it('rejects a model file required by the manifest but absent from the repository inventory', async () => {
    const { verify, manifest } = setup('private');
    manifest.files.rigs = 'sparse/0/rigs.bin';
    await expect(verify()).rejects.toThrow('published reconstruction is incomplete');
  });
  it.each(['private', 'public'] as const)('verifies ZIP metadata, settings and bounded archive reads using %s access', async visibility => {
    const { verify, request } = await setupZip(visibility);
    await verify();
    expect(request.mock.calls.map(([url]) => String(url).split('/').pop())).toEqual([
      'colmapview-inventory.json', 'colmapview.yaml', 'dataset.zip', 'dataset.zip', 'preview.png',
    ]);
    expect(request.mock.calls.every(([url]) => String(url).includes(`/resolve/${String(url).endsWith('colmapview-inventory.json') ? metadataCommit : dataCommit}/`))).toBe(true);
  });

  it('rejects a ZIP whose published payload inventory does not match the prepared data', async () => {
    const { verify, request } = await setupZip('private', true);
    await expect(verify()).rejects.toThrow('archive inventory could not be verified');
    expect(request.mock.calls.every(([url]) => String(url).endsWith('colmapview-inventory.json'))).toBe(true);
  });
  it.each(['private', 'public'] as const)('verifies manifest, settings, inventory and sample assets with %s access', async visibility => {
    const { verify, request } = setup(visibility);
    await verify();
    expect(request.mock.calls.map(([url]) => String(url).split('/').pop())).toEqual(['colmapview.json', 'colmapview.yaml', 'photo.jpg', 'preview.png']);
    for (const [, init] of request.mock.calls) {
      expect(new Headers(init?.headers).get('Authorization')).toBe(visibility === 'private' ? 'Bearer test-token' : null);
      expect(init?.credentials).toBe('omit');
    }
  });

  it('never calls a public upload verified when it is readable only with the owner token', async () => {
    const { verify, request } = setup('public', true);
    await expect(verify()).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.every(([, init]) => !new Headers(init?.headers).has('Authorization'))).toBe(true);
  });

  it('stops verification immediately if the repository became public during a private upload', async () => {
    const { verify, request } = setup('private');
    sdk.datasetInfo.mockResolvedValue({ private: false, gated: false });
    await expect(verify()).rejects.toThrow('Repository access changed');
    expect(request).not.toHaveBeenCalled();
  });

  it('reports expired access instead of treating an authenticated failure as missing files', async () => {
    const { verify, request } = setup('private');
    request.mockResolvedValue(new Response('Expired', { status: 401 }));
    await expect(verify()).rejects.toMatchObject({ status: 401 });
    expect(request).toHaveBeenCalledOnce();
  });
});
