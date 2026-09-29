import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDatasetViewerSettings, fetchPublishedViewerState } from './urlLoaderViewerState';
import { serializeDatasetViewerSettings } from '../utils/datasetViewerSettings';
import { createIdentityEuler } from '../utils/sim3dTransforms';
import type { ColmapManifest } from '../types/manifest';
import type { PublishedViewerState } from '../utils/publishedViewerState';

const manifest: ColmapManifest = { version: 1, baseUrl: 'https://huggingface.co/datasets/owner/scene/resolve/abc/',
  files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin' }, viewerStatePath: 'colmapview-state.json' };
const state: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null, config: { transform: createIdentityEuler(), splat: { transform: { ...createIdentityEuler(), translationX: 5 } } } };
beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => vi.unstubAllGlobals());

describe('manifest viewer-state loading', () => {
  it.each(['json', 'yaml'])('loads %s settings at the immutable dataset revision, including older JSON publications', async format => {
    const path = format === 'yaml' ? 'colmapview.yaml' : 'colmapview-state.json';
    const body = format === 'yaml' ? serializeDatasetViewerSettings(state) : JSON.stringify(state);
    const request = vi.fn().mockResolvedValue(new Response(body));
    await expect(fetchPublishedViewerState({ ...manifest, viewerStatePath: path }, request)).resolves.toEqual(state);
    expect(request).toHaveBeenCalledWith(manifest.baseUrl + path, { credentials: 'omit' });
  });
  it('discovers YAML for manifests on any HTTP host', async () => {
    const request = vi.fn().mockResolvedValue(new Response(serializeDatasetViewerSettings(state)));
    await expect(fetchPublishedViewerState({ ...manifest, baseUrl: 'https://example.com/scene', viewerStatePath: undefined }, request)).resolves.toEqual(state);
    expect(request).toHaveBeenCalledWith('https://example.com/scene/colmapview.yaml', { credentials: 'omit' });
  });
  it('looks beside direct files without carrying credentials or URL parameters', async () => {
    const request = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    await expect(fetchDatasetViewerSettings('https://example.com/project/scene.zip?download=1#hash', request, true)).resolves.toBeNull();
    expect(request).toHaveBeenCalledExactlyOnceWith('https://example.com/project/colmapview.yaml', { credentials: 'omit' });
  });
  it.each(['file:///scene', 'data:text/plain,test', 'https://user:password@example.com/scene'])('does not probe unsupported or credentialed URLs: %s', async url => {
    const request = vi.fn();
    expect(await fetchDatasetViewerSettings(url, request)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
  it('discovers YAML automatically for a plain Hugging Face dataset path', async () => {
    const request = vi.fn().mockResolvedValue(new Response(serializeDatasetViewerSettings(state)));
    await expect(fetchPublishedViewerState({ ...manifest, viewerStatePath: undefined }, request)).resolves.toEqual(state);
    expect(request).toHaveBeenCalledWith(manifest.baseUrl + 'colmapview.yaml', { credentials: 'omit' });
  });
  it('falls back from a subfolder to the repository root at the same revision', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('ui:\n  background_color: "#123456"\n'));
    await expect(fetchDatasetViewerSettings(manifest.baseUrl + 'splats/file.spz', request, true))
      .resolves.toMatchObject({ config: { ui: { backgroundColor: '#123456' } } });
    expect(request.mock.calls.map(call => call[0])).toEqual([manifest.baseUrl + 'splats/colmapview.yaml', manifest.baseUrl + 'colmapview.yaml']);
  });
  const everything: PublishedViewerState = { version: 1, viewerVersion: 'test',
    viewState: { position: [1, 2, 3], quaternion: [0, 0, 0, 1], target: [0, 0, 0], distance: 4 },
    config: { ui: { backgroundColor: '#123456' }, camera: { selectedImageId: 3 }, transform: { ...createIdentityEuler(), translationZ: 2 },
      splat: { activeSourceId: 'splats/file.spz', transform: { ...createIdentityEuler(), translationX: 5 } } } };
  const fromParentFolder = () => vi.fn().mockResolvedValueOnce(new Response('', { status: 404 }))
    .mockResolvedValueOnce(new Response(serializeDatasetViewerSettings(everything)));
  const expectDisplayOnly = (result: PublishedViewerState | null) => {
    expect(result?.config.ui).toEqual({ backgroundColor: '#123456' });
    expect(result?.viewState).toBeNull();
    expect(result?.config.transform).toBeUndefined();
    expect(result?.config.splat).toBeUndefined();
    expect(result?.config.camera?.selectedImageId).toBeUndefined();
  };
  it('applies only display settings found in a parent folder of the loaded project', async () => {
    expectDisplayOnly(await fetchDatasetViewerSettings(manifest.baseUrl + 'siteB', fromParentFolder()));
  });
  it('applies parent-folder settings in full to the splat they saved as active', async () => {
    await expect(fetchDatasetViewerSettings(manifest.baseUrl + 'splats/file.spz', fromParentFolder(), true)).resolves.toEqual(everything);
  });
  it('applies only display settings from a parent folder to a different splat', async () => {
    expectDisplayOnly(await fetchDatasetViewerSettings(manifest.baseUrl + 'splats/other.spz', fromParentFolder(), true));
  });
  it.each([404, 403, 503])('skips optional metadata when the server returns %s', async status => {
    await expect(fetchDatasetViewerSettings(manifest.baseUrl, vi.fn().mockResolvedValue(new Response('', { status })))).resolves.toBeNull();
  });
  it('skips invalid or oversized optional YAML but rejects invalid explicitly referenced YAML', async () => {
    const invalid = () => vi.fn().mockResolvedValue(new Response('version: 200'));
    await expect(fetchDatasetViewerSettings(manifest.baseUrl, invalid())).resolves.toBeNull();
    await expect(fetchDatasetViewerSettings(manifest.baseUrl,
      vi.fn().mockResolvedValue(new Response('x', { headers: { 'content-length': '300000' } })))).resolves.toBeNull();
    await expect(fetchPublishedViewerState({ ...manifest, viewerStatePath: 'colmapview.yaml' }, invalid())).rejects.toThrow('invalid');
  });
  it('propagates cancellation instead of treating it as a missing file', async () => {
    await expect(fetchDatasetViewerSettings(manifest.baseUrl, vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'))))
      .rejects.toThrow('Cancelled');
  });
  it.each(['../state.json', 'https://other.example/state.json', '/state.json'])('rejects a non-relative state path %s', async path => {
    const request = vi.fn();
    await expect(fetchPublishedViewerState({ ...manifest, viewerStatePath: path }, request)).rejects.toThrow('path');
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects malformed and oversized state documents instead of loading misaligned splats', async () => {
    await expect(fetchPublishedViewerState(manifest, vi.fn().mockResolvedValue(Response.json({ ...state, version: 2 })))).rejects.toThrow('invalid');
    await expect(fetchPublishedViewerState(manifest, vi.fn().mockResolvedValue(new Response('x', { headers: { 'content-length': '300000' } })))).rejects.toThrow('size');
  });
});
