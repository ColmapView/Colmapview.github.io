import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHubPublication } from './publication';
import type { PublicationAssetSummary } from '../datasetPublishing/types';

const preview = new File(['normalized preview'], 'preview.png', { type: 'image/png' });
const viewer = 'https://colmapview.opsiclear.com/?url=https%3A%2F%2Fstorage.example%2Fmanifest.json#camera=43';
const HUB = 'https://colmapview.opsiclear.com/hub';
const result = { url: `${HUB}/HappyTree-AAAAAAAAAAAAAAAA`, managementUrl: `${HUB}/manage/HappyTree-AAAAAAAAAAAAAAAA` };

/** Publishes through the real Hub request, answered by a stubbed Hub at https://hub.invalid/hub. */
async function publishThroughHub(body: unknown, viewerUrl = viewer) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json(body, { status: 201 }));
  vi.stubGlobal('fetch', fetch);
  const controller = createHubPublication({ baseUrl: () => 'https://hub.invalid/hub', thumbnail: async () => 'jpeg' });
  controller.prepare({ title: 'Scene' }, { listed: false, preview });
  await controller.finish(viewerUrl);
  return { fetch, controller };
}

describe('automatic Hub step after public upload', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('saves nothing when the private upload has no Hub draft', async () => {
    const request = vi.fn();
    const controller = createHubPublication({ request, baseUrl: () => HUB });
    controller.prepare({ title: 'Scene' });
    await controller.finish(viewer);
    expect(request).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toEqual({ phase: 'idle' });
  });

  it('waits for the verified upload URL, keeps license and view settings, and does not save provider credentials', async () => {
    const thumbnail = vi.fn().mockResolvedValue('small-jpeg-base64');
    const request = vi.fn().mockResolvedValue(result);
    const controller = createHubPublication({ thumbnail, request, baseUrl: () => HUB });
    const license = { id: 'cc-by-4.0', name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
    controller.prepare({ title: 'Scene', description: 'Reconstruction', license }, { listed: false, preview });
    expect(request).not.toHaveBeenCalled();
    await controller.finish(viewer);
    const payload = request.mock.calls[0][1];
    expect(payload).toEqual({ viewerUrl: viewer, title: 'Scene', description: 'Reconstruction', license,
      thumbnailBase64: 'small-jpeg-base64', managementSecret: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), listed: false, publicAcknowledged: true });
    expect(thumbnail).toHaveBeenCalledWith(preview);
    expect(controller.getSnapshot()).toEqual({ phase: 'ready', viewerUrl: viewer, url: result.url,
      managementUrl: `${result.managementUrl}#${payload.managementSecret}` });
    await controller.finish(viewer);
    expect(request).toHaveBeenCalledOnce();
  });

  it('retries lost responses with the same payload and ownership key without repeating the storage upload', async () => {
    const thumbnail = vi.fn().mockResolvedValue('small-jpeg-base64');
    const request = vi.fn().mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValue(result);
    const controller = createHubPublication({ thumbnail, request, baseUrl: () => HUB });
    controller.prepare({ title: 'Scene' }, { listed: true, preview });
    await controller.finish(viewer);
    expect(controller.getSnapshot()).toEqual({ phase: 'failed', viewerUrl: viewer, error: 'Connection lost' });
    await controller.finish(viewer);
    expect(request).toHaveBeenCalledOnce();
    await controller.retry();
    expect(request.mock.calls[1][1]).toBe(request.mock.calls[0][1]);
    expect(request.mock.calls[1][1].listed).toBe(true);
    expect(thumbnail).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().phase).toBe('ready');
  });

  it('keeps the verified asset inventory through a thumbnail failure and retry', async () => {
    const assets: PublicationAssetSummary = { format: 'zip', imageFormat: 'jpeg', colmap: { files: 3, cameras: 2, points: 1000 },
      images: 2, masks: 1, splats: 1, viewerSettings: true, preview: false };
    const original = structuredClone(assets);
    const request = vi.fn().mockResolvedValue(result);
    const thumbnail = vi.fn().mockRejectedValueOnce(new Error('Preview decode failed')).mockResolvedValue('jpeg');
    const controller = createHubPublication({ request, thumbnail, baseUrl: () => HUB });
    controller.prepare({ title: 'Scene' }, { listed: false, preview });
    await controller.finish(viewer, assets);
    expect(request).not.toHaveBeenCalled();
    assets.masks = 99;
    await controller.retry();
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1].assets).toEqual(original);
  });

  it('ignores duplicate completion notifications while creating a link', async () => {
    let resolve!: (value: typeof result) => void;
    const request = vi.fn(() => new Promise<typeof result>(done => { resolve = done; }));
    const controller = createHubPublication({ thumbnail: async () => 'jpeg', request, baseUrl: () => HUB });
    controller.prepare({ title: 'Scene' }, { listed: false, preview });
    const first = controller.finish(viewer);
    await Promise.resolve();
    await controller.finish(viewer);
    expect(request).toHaveBeenCalledOnce();
    expect(() => controller.prepare({ title: 'Changed' })).toThrow('Wait for the current short link');
    resolve(result);
    await first;
    expect(controller.getSnapshot().phase).toBe('ready');
  });

  it('bounds card metadata without altering the original upload details', async () => {
    const request = vi.fn().mockResolvedValue(result);
    const controller = createHubPublication({ thumbnail: async () => 'jpeg', request, baseUrl: () => HUB });
    const metadata = { title: 'A'.repeat(200), description: 'B'.repeat(10000) };
    controller.prepare(metadata, { listed: false, preview });
    await controller.finish(viewer);
    expect(request.mock.calls[0][1].title).toHaveLength(120);
    expect(request.mock.calls[0][1].description).toHaveLength(280);
    expect(metadata.title).toHaveLength(200);
    expect(metadata.description).toHaveLength(10000);
  });

  it('creates nothing when the Hub is off for this host', async () => {
    const request = vi.fn();
    const controller = createHubPublication({ request, baseUrl: () => null, thumbnail: async () => 'jpeg' });
    controller.prepare({ title: 'Scene' }, { listed: false, preview });
    await controller.finish(viewer);
    expect(request).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toEqual({ phase: 'idle' });
  });

  it('takes no screenshot for the card when the Hub is off for this host', async () => {
    const capture = vi.fn().mockResolvedValue(preview);
    const request = vi.fn();
    const controller = createHubPublication({ request, capture, baseUrl: () => null });
    controller.prepare({ title: 'Scene' }, { listed: false });
    await Promise.resolve();
    await controller.finish(viewer);
    expect(capture).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toEqual({ phase: 'idle' });
  });

  it('sends the viewer link unchanged and accepts only links under the configured Hub', async () => {
    const local = 'http://localhost:5173/?url=https%3A%2F%2Fstorage.example%2Fscene.zip';
    const { fetch, controller } = await publishThroughHub({ url: 'https://elsewhere.example/hub/X', managementPath: '/hub/manage/X' }, local);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://hub.invalid/hub/api/links');
    expect(JSON.parse(String(init.body)).viewerUrl).toBe(local);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', error: 'The Hub returned an invalid link.' });
  });

  it('returns absolute Hub links, with the delete key in the management link fragment', async () => {
    const { fetch, controller } = await publishThroughHub({ id: 'HappyTree', url: 'https://hub.invalid/hub/HappyTree', managementPath: '/hub/manage/HappyTree' });
    const { managementSecret } = JSON.parse(String(fetch.mock.calls[0][1].body));
    expect(controller.getSnapshot()).toEqual({ phase: 'ready', viewerUrl: viewer, url: 'https://hub.invalid/hub/HappyTree',
      managementUrl: `https://hub.invalid/hub/manage/HappyTree#${managementSecret}` });
  });

  it.each([
    ['a relative link', { url: '/hub/Name', managementPath: '/hub/manage/Name' }],
    ['a link under /hubX', { url: 'https://hub.invalid/hubX/Name', managementPath: '/hub/manage/Name' }],
    ['a delete link on another host', { url: 'https://hub.invalid/hub/Name', managementPath: 'https://elsewhere.example/hub/manage/Name' }],
    ['a delete link outside /hub/manage/', { url: 'https://hub.invalid/hub/Name', managementPath: '/hub/Name' }],
    ['a malformed delete link', { url: 'https://hub.invalid/hub/Name', managementPath: 'https://[' }],
  ])('rejects %s as an invalid link', async (_case, body) => {
    const { controller } = await publishThroughHub(body);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', error: 'The Hub returned an invalid link.' });
  });

  it('skips a private bucket without preparing or uploading its thumbnail', async () => {
    const request = vi.fn();
    const thumbnail = vi.fn();
    const controller = createHubPublication({ request, thumbnail, publicAccess: async () => false, baseUrl: () => HUB });
    controller.prepare({ title: 'Private scene' }, { listed: true, preview });
    await controller.finish(viewer);
    expect(request).not.toHaveBeenCalled();
    expect(thumbnail).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toEqual({ phase: 'idle', viewerUrl: viewer });
  });

  it('captures the current view before uploading when no prepared preview is available', async () => {
    const capture = vi.fn().mockResolvedValue(preview);
    const thumbnail = vi.fn().mockResolvedValue('jpeg');
    const request = vi.fn().mockResolvedValue(result);
    const controller = createHubPublication({ request, thumbnail, capture, baseUrl: () => HUB });
    controller.prepare({ title: 'Scene' }, { listed: false });
    await Promise.resolve();
    expect(capture).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
    await controller.finish(viewer);
    expect(thumbnail).toHaveBeenCalledWith(preview);
    expect(controller.getSnapshot().phase).toBe('ready');
  });
});
