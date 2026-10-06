import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDatasetViewerSettings, fetchOptionalDatasetViewerSettingsResult, fetchPublishedViewerState,
  OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS, startOptionalDatasetViewerSettings } from './urlLoaderViewerState';
import { serializeDatasetViewerSettings } from '../utils/datasetViewerSettings';
import { createIdentityEuler } from '../utils/sim3dTransforms';
import type { ColmapManifest } from '../types/manifest';
import type { PublishedViewerState } from '../utils/publishedViewerState';
import { appLogger } from '../utils/logger';
import * as datasetViewerSettings from '../utils/datasetViewerSettings';

const manifest: ColmapManifest = { version: 1, baseUrl: 'https://huggingface.co/datasets/owner/scene/resolve/abc/',
  files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin' }, viewerStatePath: 'colmapview-state.json' };
const state: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null, config: { transform: createIdentityEuler(), splat: { transform: { ...createIdentityEuler(), translationX: 5 } } } };
const SKIPPED_SETTINGS_WARNING = '[URL Loader] Skipping unavailable or invalid colmapview.yaml settings.';
/** Lets a request that is already answered finish before anything asks for its result. */
const flushRequest = () => new Promise(resolve => setTimeout(resolve, 0));
beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('manifest viewer-state loading', () => {
  it('bounds automatic direct-file metadata and aborts the stalled request', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | null | undefined;
    const request = vi.fn((_url: string, init?: RequestInit) => {
      requestSignal = init?.signal;
      return new Promise<Response>(() => {});
    });
    const pending = fetchOptionalDatasetViewerSettingsResult(manifest.baseUrl + 'scene.spz', request, true);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ state: null, timedOut: true });
    expect(requestSignal?.aborted).toBe(true);
  });

  it('cancels optional metadata promptly even when an injected fetch does not settle on abort', async () => {
    const controller = new AbortController();
    const pending = fetchOptionalDatasetViewerSettingsResult(manifest.baseUrl,
      () => new Promise<Response>(() => {}), false, controller.signal);
    const aborted = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await aborted;
  });

  it('starts the deadline when the result is needed, not when the request starts', async () => {
    vi.useFakeTimers();
    let respond!: (response: Response) => void;
    const request = vi.fn(() => new Promise<Response>(resolve => { respond = resolve; }));
    const pending = startOptionalDatasetViewerSettings(manifest.baseUrl, request);
    // COLMAP files take longer than the whole deadline to download and parse.
    await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS * 3);
    const result = pending.settle();
    await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS - 1);
    vi.useRealTimers();
    respond(new Response('ui:\n  background_color: "#123456"\n'));
    await expect(result).resolves.toEqual({
      state: expect.objectContaining({ config: { ui: { backgroundColor: '#123456' } } }), timedOut: false });
  });

  it('reports a timeout and aborts the request when the result is still missing at the deadline', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | null | undefined;
    const request = vi.fn((_url: string, init?: RequestInit) => { requestSignal = init?.signal; return new Promise<Response>(() => {}); });
    const pending = startOptionalDatasetViewerSettings(manifest.baseUrl, request);
    const result = pending.settle();
    await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS);
    await expect(result).resolves.toEqual({ state: null, timedOut: true });
    expect(requestSignal?.aborted).toBe(true);
  });

  it('returns settings that arrived before they were needed, once, without a second deadline', async () => {
    const parse = vi.spyOn(datasetViewerSettings, 'parseDatasetViewerSettings');
    const request = vi.fn(async () => new Response('ui:\n  background_color: "#123456"\n'));
    const pending = startOptionalDatasetViewerSettings(manifest.baseUrl, request);
    await flushRequest();
    expect(parse).toHaveBeenCalledOnce();
    vi.useFakeTimers();
    const first = pending.settle();
    expect(pending.settle()).toBe(first);
    // At most one deadline, however often the result is asked for.
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
    await expect(first).resolves.toMatchObject({ timedOut: false, state: { config: { ui: { backgroundColor: '#123456' } } } });
    expect(vi.getTimerCount()).toBe(0);
    expect(request).toHaveBeenCalledOnce();
  });

  it('counts a transport timeout that happened before the result was needed as a timeout', async () => {
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
    // fetchWithTimeout gives up on a stalled request after 30 s, long before slow parsing ends.
    const request = vi.fn(async (): Promise<Response> => { throw new DOMException('Request timed out', 'TimeoutError'); });
    const pending = startOptionalDatasetViewerSettings(manifest.baseUrl, request);
    await flushRequest();
    // The request has already failed when the result is first needed.
    expect(warn).toHaveBeenCalledExactlyOnceWith(SKIPPED_SETTINGS_WARNING);
    await expect(pending.settle()).resolves.toEqual({ state: null, timedOut: true });
  });

  it('rejects at once when the load was cancelled before the settings were needed, even if the request ignores it', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = startOptionalDatasetViewerSettings(manifest.baseUrl, () => new Promise<Response>(() => {}), false, controller.signal);
    controller.abort();
    const settled = expect(pending.settle()).rejects.toMatchObject({ name: 'AbortError' });
    // No deadline is armed for a load that is already gone; the cancellation, not a timeout, answers.
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS);
    await settled;
  });

  it('counts a transport timeout reported as a plain AbortError as a timeout', async () => {
    // Engines that predate abort-reason propagation reject fetch with AbortError even for timeouts.
    const request = vi.fn(async (): Promise<Response> => { throw new DOMException('The operation was aborted.', 'AbortError'); });
    // The load's own signal is present and live, as in production.
    const pending = startOptionalDatasetViewerSettings(manifest.baseUrl, request, false, new AbortController().signal);
    await expect(pending.settle()).resolves.toEqual({ state: null, timedOut: true });
  });

  it('keeps cancellation fatal when the load is cancelled before the settings are needed', async () => {
    const controller = new AbortController();
    // Like fetch, the request rejects with an AbortError once its signal aborts.
    const request = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    }));
    const pending = startOptionalDatasetViewerSettings(manifest.baseUrl, request, false, controller.signal);
    controller.abort();
    // The rejected request settles before the result is needed, so settle() sees it, not only the abort.
    await flushRequest();
    await expect(pending.settle()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('still reports a timed-out direct read as missing settings', async () => {
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
    const request = vi.fn(async (): Promise<Response> => { throw new DOMException('Request timed out', 'TimeoutError'); });
    await expect(fetchDatasetViewerSettings(manifest.baseUrl, request)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledExactlyOnceWith(SKIPPED_SETTINGS_WARNING);
  });
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
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
    const invalid = () => vi.fn().mockResolvedValue(new Response('version: 200'));
    await expect(fetchDatasetViewerSettings(manifest.baseUrl, invalid())).resolves.toBeNull();
    await expect(fetchDatasetViewerSettings(manifest.baseUrl,
      vi.fn().mockResolvedValue(new Response('x', { headers: { 'content-length': '300000' } })))).resolves.toBeNull();
    await expect(fetchPublishedViewerState({ ...manifest, viewerStatePath: 'colmapview.yaml' }, invalid())).rejects.toThrow('invalid');
    // One warning per skipped optional file; the explicit reference fails loudly instead.
    expect(warn.mock.calls).toEqual([[SKIPPED_SETTINGS_WARNING], [SKIPPED_SETTINGS_WARNING]]);
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
