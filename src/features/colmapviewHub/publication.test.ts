import { describe, expect, it, vi } from 'vitest';
import { createHubPublication, hubViewerUrl } from './publication';
import type { PublicationAssetSummary } from '../datasetPublishing/types';

const preview = new File(['normalized preview'], 'preview.png', { type: 'image/png' });
const viewer = 'https://colmapview.opsiclear.com/?url=https%3A%2F%2Fstorage.example%2Fmanifest.json#camera=43';
const result = { url: 'https://colmapview.opsiclear.com/hub/HappyTree-AAAAAAAAAAAAAAAA', managementPath: '/hub/manage/HappyTree-AAAAAAAAAAAAAAAA' };

describe('automatic Hub step after public upload', () => {
  it('saves nothing when the private upload has no Hub draft', async () => {
    const request = vi.fn();
    const controller = createHubPublication({ request });
    controller.prepare({ title: 'Scene' });
    await controller.finish(viewer);
    expect(request).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toEqual({ phase: 'idle' });
  });

  it('waits for the verified upload URL, keeps license and view settings, and does not save provider credentials', async () => {
    const thumbnail = vi.fn().mockResolvedValue('small-jpeg-base64');
    const request = vi.fn().mockResolvedValue(result);
    const controller = createHubPublication({ thumbnail, request });
    const license = { id: 'cc-by-4.0', name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
    controller.prepare({ title: 'Scene', description: 'Reconstruction', license }, { listed: false, preview });
    expect(request).not.toHaveBeenCalled();
    await controller.finish(viewer);
    const payload = request.mock.calls[0][0];
    expect(payload).toEqual({ viewerUrl: viewer, title: 'Scene', description: 'Reconstruction', license,
      thumbnailBase64: 'small-jpeg-base64', managementSecret: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), listed: false, publicAcknowledged: true });
    expect(thumbnail).toHaveBeenCalledWith(preview);
    expect(controller.getSnapshot()).toEqual({ phase: 'ready', viewerUrl: viewer, url: result.url,
      managementUrl: `https://colmapview.opsiclear.com${result.managementPath}#${payload.managementSecret}` });
    await controller.finish(viewer);
    expect(request).toHaveBeenCalledOnce();
  });

  it('retries lost responses with the same payload and ownership key without repeating the storage upload', async () => {
    const thumbnail = vi.fn().mockResolvedValue('small-jpeg-base64');
    const request = vi.fn().mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValue(result);
    const controller = createHubPublication({ thumbnail, request });
    controller.prepare({ title: 'Scene' }, { listed: true, preview });
    await controller.finish(viewer);
    expect(controller.getSnapshot()).toEqual({ phase: 'failed', viewerUrl: viewer, error: 'Connection lost' });
    await controller.finish(viewer);
    expect(request).toHaveBeenCalledOnce();
    await controller.retry();
    expect(request.mock.calls[1][0]).toBe(request.mock.calls[0][0]);
    expect(request.mock.calls[1][0].listed).toBe(true);
    expect(thumbnail).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().phase).toBe('ready');
  });

  it('keeps the verified asset inventory through a thumbnail failure and retry', async () => {
    const assets: PublicationAssetSummary = { format: 'zip', imageFormat: 'jpeg', colmap: { files: 3, cameras: 2, points: 1000 },
      images: 2, masks: 1, splats: 1, viewerSettings: true, preview: false };
    const original = structuredClone(assets);
    const request = vi.fn().mockResolvedValue(result);
    const thumbnail = vi.fn().mockRejectedValueOnce(new Error('Preview decode failed')).mockResolvedValue('jpeg');
    const controller = createHubPublication({ request, thumbnail });
    controller.prepare({ title: 'Scene' }, { listed: false, preview });
    await controller.finish(viewer, assets);
    expect(request).not.toHaveBeenCalled();
    assets.masks = 99;
    await controller.retry();
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0].assets).toEqual(original);
  });

  it('ignores duplicate completion notifications while creating a link', async () => {
    let resolve!: (value: typeof result) => void;
    const request = vi.fn(() => new Promise<typeof result>(done => { resolve = done; }));
    const controller = createHubPublication({ thumbnail: async () => 'jpeg', request });
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
    const controller = createHubPublication({ thumbnail: async () => 'jpeg', request });
    const metadata = { title: 'A'.repeat(200), description: 'B'.repeat(10000) };
    controller.prepare(metadata, { listed: false, preview });
    await controller.finish(viewer);
    expect(request.mock.calls[0][0].title).toHaveLength(120);
    expect(request.mock.calls[0][0].description).toHaveLength(280);
    expect(metadata.title).toHaveLength(200);
    expect(metadata.description).toHaveLength(10000);
  });

  it('uses the hosted viewer for local links while preserving the source URL and camera fragment', () => {
    const local = new URL(viewer);
    local.protocol = 'http:';
    local.host = 'localhost:5199';
    expect(hubViewerUrl(local.href)).toBe(viewer);
    expect(hubViewerUrl('https://colmapview.github.io/latest/?url=https://storage.example/manifest.json#camera=43'))
      .toBe('https://colmapview.github.io/latest/?url=https://storage.example/manifest.json#camera=43');
  });

  it('skips a private bucket without preparing or uploading its thumbnail', async () => {
    const request = vi.fn();
    const thumbnail = vi.fn();
    const controller = createHubPublication({ request, thumbnail, publicAccess: async () => false });
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
    const controller = createHubPublication({ request, thumbnail, capture });
    controller.prepare({ title: 'Scene' }, { listed: false });
    await Promise.resolve();
    expect(capture).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
    await controller.finish(viewer);
    expect(thumbnail).toHaveBeenCalledWith(preview);
    expect(controller.getSnapshot().phase).toBe('ready');
  });
});
