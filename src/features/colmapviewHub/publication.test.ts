import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHubPublication, HubRequestError, requestHubLink } from './publication';
import { hubShareLinks } from './hubShareLinks';
import type { PublicationAssetSummary } from '../datasetPublishing/types';

const HUB = 'https://hub.invalid/hub';
const preview = new File(['normalized preview'], 'preview.png', { type: 'image/png' });
const viewer = 'https://colmapview.opsiclear.com/?url=https://storage.example/manifest.json';
const link = { url: `${HUB}/HappyTree`, managementUrl: `${HUB}/manage/HappyTree` };
const source = { key: '1:url:https://storage.example/manifest.json:', revision: 0 };

/** A controller with mock dependencies; tests that override one keep their own reference to it. */
function controller(overrides: NonNullable<Parameters<typeof createHubPublication>[1]> = {}) {
  const request = vi.fn().mockResolvedValue(link);
  const thumbnail = vi.fn().mockResolvedValue('small-jpeg');
  const hub = createHubPublication('huggingFace', { baseUrl: () => HUB, thumbnail, request, notify: vi.fn(), currentSource: () => source, ...overrides });
  return { hub, request, thumbnail };
}

beforeEach(() => { for (const provider of ['huggingFace', 'googleDrive', 'bucket']) hubShareLinks.set(provider, null); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Hub controller', () => {
  it('does nothing when the Hub is off for this host', async () => {
    const { hub, request } = controller({ baseUrl: () => null });
    expect(hub.isEnabled()).toBe(false);
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source });
    await hub.finish(viewer);
    expect(request).not.toHaveBeenCalled();
    expect(hub.getSnapshot()).toEqual({ phase: 'idle' });
  });

  it('takes no screenshot for the card when the Hub is off for this host', async () => {
    const capture = vi.fn().mockResolvedValue(preview);
    const { hub, request } = controller({ baseUrl: () => null });
    hub.prepare({ title: 'Scene' }, { access: 'public', source, capture });
    await Promise.resolve();
    await hub.finish(viewer);
    expect(capture).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(hub.getSnapshot()).toEqual({ phase: 'idle' });
  });

  it('creates a public link once the upload is verified, and ignores repeated completions', async () => {
    const { hub, request, thumbnail } = controller();
    const license = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
    hub.prepare({ title: 'Scene', description: 'Reconstruction', license }, { access: 'public', preview, source });
    expect(request).not.toHaveBeenCalled();
    await hub.finish(viewer);
    const [base, payload] = request.mock.calls[0];
    expect(base).toBe(HUB);
    expect(payload).toEqual({ viewerUrl: viewer, title: 'Scene', description: 'Reconstruction', license,
      thumbnailBase64: 'small-jpeg', managementSecret: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), publicAcknowledged: true });
    expect(thumbnail).toHaveBeenCalledWith(preview);
    expect(hub.getSnapshot()).toEqual({ phase: 'ready', viewerUrl: viewer, url: link.url,
      managementUrl: `${link.managementUrl}#${payload.managementSecret}`, deleteLinkSeen: false });
    await hub.finish(viewer);
    expect(request).toHaveBeenCalledOnce();
  });

  it('creates an unguessable link for a private upload', async () => {
    const { hub, request } = controller();
    hub.prepare({ title: 'Private scene' }, { access: 'private', preview, source });
    await hub.finish(viewer);
    expect(request.mock.calls[0][1].access).toBe('private');
  });

  it.each([['public', 'public'], ['private', 'private'], ['unknown', 'private']] as const)('sends a %s bucket as %s, checking once', async (result, access) => {
    const checkBucket = vi.fn().mockResolvedValue(result);
    const request = vi.fn().mockRejectedValueOnce(new HubRequestError("Couldn't reach ColmapView Hub.", 'network')).mockResolvedValue(link);
    const { hub } = controller({ checkBucket, request });
    const phases: string[] = [];
    hub.subscribe(() => phases.push(hub.getSnapshot().phase));
    hub.prepare({ title: 'Bucket scene' }, { access: 'check', preview, source });
    await hub.finish(viewer);
    await hub.retry();
    expect(phases).toEqual(['idle', 'checking', 'creating', 'failed', 'creating', 'ready']);
    expect(checkBucket).toHaveBeenCalledOnce();
    expect(request.mock.calls[1][1].access).toBe(access === 'private' ? 'private' : undefined);
    expect(hub.getSnapshot().bucketAccess).toBe(result);
  });

  it('retries a network failure with the same payload and key, and offers no Retry for a rejection', async () => {
    const request = vi.fn().mockRejectedValueOnce(new HubRequestError("Couldn't reach ColmapView Hub.", 'network'))
      .mockRejectedValueOnce(new HubRequestError('Use a viewer link without access credentials.', 'rejected'));
    const { hub, thumbnail } = controller({ request });
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source });
    await hub.finish(viewer);
    expect(hub.getSnapshot()).toMatchObject({ phase: 'failed', error: "Couldn't reach ColmapView Hub.", retryable: true });
    await hub.retry();
    expect(request.mock.calls[1][1]).toBe(request.mock.calls[0][1]);
    expect(thumbnail).toHaveBeenCalledOnce();
    expect(hub.getSnapshot()).toMatchObject({ phase: 'failed', error: 'Use a viewer link without access credentials.', retryable: false });
    await hub.retry();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('enables Retry after a 429 only once Retry-After passes', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockRejectedValueOnce(new HubRequestError('Too many requests from your network; try again in 2 min.', 'rate-limited', 120_000))
      .mockResolvedValue(link);
    const { hub } = controller({ request });
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source });
    await hub.finish(viewer);
    expect(hub.getSnapshot().retryAfter).toBeGreaterThan(Date.now());
    await hub.retry();
    expect(request).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(120_000);
    expect(hub.getSnapshot().retryAfter).toBeUndefined();
    await hub.retry();
    expect(hub.getSnapshot().phase).toBe('ready');
  });

  it('captures a missing preview again on Retry, and offers no Retry when it cannot', async () => {
    const capture = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(preview);
    const { hub, thumbnail } = controller();
    hub.prepare({ title: 'Scene' }, { access: 'public', source, capture });
    await hub.finish(viewer);
    expect(hub.getSnapshot()).toMatchObject({ phase: 'failed', error: 'The upload preview is unavailable.', retryable: true });
    await hub.retry();
    expect(capture).toHaveBeenCalledTimes(2);
    expect(thumbnail).toHaveBeenCalledWith(preview);
    expect(hub.getSnapshot().phase).toBe('ready');
    const without = controller();
    without.hub.prepare({ title: 'Scene' }, { access: 'public', source });
    await without.hub.finish(viewer);
    expect(without.hub.getSnapshot()).toMatchObject({ phase: 'failed', retryable: false });
  });

  it('captures nothing on Retry once another dataset is on screen, and offers no further Retry', async () => {
    const capture = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(preview);
    let onScreen = source;
    const { hub, request } = controller({ currentSource: () => onScreen });
    hub.prepare({ title: 'Scene' }, { access: 'public', source, capture });
    await hub.finish(viewer);
    expect(hub.getSnapshot()).toMatchObject({ phase: 'failed', retryable: true });
    onScreen = { key: '2:url:https://storage.example/other.json:', revision: 0 };
    await hub.retry();
    expect(capture).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
    expect(hub.getSnapshot()).toMatchObject({ phase: 'failed', viewerUrl: viewer, retryable: false,
      error: "The dataset changed, so its preview can't be captured. Upload again to create a Hub link." });
    onScreen = source;
    await hub.retry();
    expect(capture).toHaveBeenCalledOnce();
  });

  it('captures nothing on Retry after an edit to the same dataset', async () => {
    const capture = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(preview);
    const { hub } = controller({ currentSource: () => ({ ...source, revision: 1 }) });
    hub.prepare({ title: 'Scene' }, { access: 'public', source, capture });
    await hub.finish(viewer);
    await hub.retry();
    expect(capture).not.toHaveBeenCalled();
    expect(hub.getSnapshot()).toMatchObject({ phase: 'failed', retryable: false });
  });

  it('shows one toast when a link finishes while its dialog is closed, and none while it is open', async () => {
    const notify = vi.fn();
    const request = vi.fn().mockResolvedValueOnce(link).mockRejectedValueOnce(new HubRequestError('ColmapView Hub is unavailable.', 'unavailable')).mockResolvedValue(link);
    const { hub } = controller({ notify, request });
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source });
    await hub.finish(viewer);
    expect(notify).toHaveBeenCalledExactlyOnceWith('info', 'Hub link ready. Reopen the upload dialog to copy it and its delete link.');
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source });
    await hub.finish(viewer);
    expect(notify).toHaveBeenLastCalledWith('warning', 'Hub link not created. Reopen the upload dialog to retry.');
    hub.setDialogOpen(true);
    await hub.retry();
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('shows exactly one toast when the bucket dialog closes during the access check', async () => {
    let finishCheck!: (value: 'public') => void;
    const notify = vi.fn();
    const { hub } = controller({ notify, checkBucket: vi.fn(() => new Promise<'public'>(resolve => { finishCheck = resolve; })) });
    hub.setDialogOpen(true);
    hub.prepare({ title: 'Bucket scene' }, { access: 'check', preview, source });
    const finishing = hub.finish(viewer);
    expect(hub.getSnapshot().phase).toBe('checking');
    hub.setDialogOpen(false);
    finishCheck('public');
    await finishing;
    expect(notify).toHaveBeenCalledExactlyOnceWith('info', 'Hub link ready. Reopen the upload dialog to copy it and its delete link.');
  });

  it('asks to stay on the page while busy and until the delete link has been shown', async () => {
    let answer!: (value: typeof link) => void;
    const request = vi.fn(() => new Promise<typeof link>(resolve => { answer = resolve; }));
    const { hub } = controller({ request });
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source });
    expect(hub.blocksUnload()).toBe(false);
    const finishing = hub.finish(viewer);
    expect(hub.isBusy()).toBe(true);
    expect(hub.blocksUnload()).toBe(true);
    expect(() => hub.prepare({ title: 'Changed' }, { access: 'public', preview, source })).toThrow('Wait for the current Hub link');
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    answer(link);
    await finishing;
    expect(hub.blocksUnload()).toBe(true);
    hub.markDeleteLinkSeen();
    expect(hub.blocksUnload()).toBe(false);
    expect(hub.getSnapshot().deleteLinkSeen).toBe(true);
  });

  it('offers the ready link to the Share panel for the dataset it was made from', async () => {
    const { hub } = controller();
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source });
    await hub.finish(viewer);
    expect(hubShareLinks.match(source, 0)).toBe(link.url);
    expect(hubShareLinks.match({ ...source, revision: 1 }, 0)).toBeNull();
    hub.prepare({ title: 'Next' }, { access: 'public', preview, source });
    expect(hubShareLinks.match(source, 0)).toBeNull();
  });

  it('keeps the verified asset inventory snapshot through a failure and retry', async () => {
    const assets: PublicationAssetSummary = { format: 'zip', imageFormat: 'jpeg', colmap: { files: 3, cameras: 2, points: 1000 },
      images: 2, masks: 1, splats: 1, viewerSettings: true, preview: false };
    const original = structuredClone(assets);
    const thumbnail = vi.fn().mockRejectedValueOnce(new Error('Preview decode failed')).mockResolvedValue('jpeg');
    const capture = vi.fn().mockResolvedValue(preview);
    const { hub, request } = controller({ thumbnail });
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source, capture });
    await hub.finish(viewer, assets);
    expect(hub.getSnapshot()).toMatchObject({ phase: 'failed', error: 'The card preview could not be created.', retryable: true });
    assets.masks = 99;
    await hub.retry();
    expect(request.mock.calls[0][1].assets).toEqual(original);
  });
});

describe('requestHubLink', () => {
  const payload = { viewerUrl: viewer, title: 'Scene', description: '', thumbnailBase64: 'x', managementSecret: 'S'.repeat(43),
    access: 'public' as const, publicAcknowledged: true as const };

  it.each([
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch')), "Couldn't reach ColmapView Hub.", 'network', 0],
    ['a timeout', () => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')), "ColmapView Hub didn't respond.", 'timeout', 0],
    ['a 503', () => Promise.resolve(new Response('Temporary failure', { status: 503 })), 'ColmapView Hub is unavailable.', 'unavailable', 0],
    ['a 429 with Retry-After', () => Promise.resolve(Response.json({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: { 'Retry-After': '120' } })),
      'Too many requests from your network; try again in 2 min.', 'rate-limited', 120_000],
    ['a 429 without a readable Retry-After', () => Promise.resolve(Response.json({}, { status: 429 })),
      'Too many requests from your network; try again in 1 min.', 'rate-limited', 60_000],
    ['a 400 rejection', () => Promise.resolve(Response.json({ error: 'Use a viewer link without access credentials.' }, { status: 400 })),
      'Use a viewer link without access credentials.', 'rejected', 0],
    ['a 409', () => Promise.resolve(Response.json({ error: 'No free link name. Create a new link.' }, { status: 409 })), 'No free link name. Create a new link.', 'rejected', 0],
    ['a link on another host', () => Promise.resolve(Response.json({ url: 'https://evil.example/hub/X', managementPath: '/hub/manage/X' }, { status: 201 })),
      'ColmapView Hub returned an invalid link.', 'rejected', 0],
    ['a link under /hubX', () => Promise.resolve(Response.json({ url: 'https://hub.invalid/hubX/Name', managementPath: '/hub/manage/Name' }, { status: 201 })),
      'ColmapView Hub returned an invalid link.', 'rejected', 0],
    ['a relative link', () => Promise.resolve(Response.json({ url: '/hub/Name', managementPath: '/hub/manage/Name' }, { status: 201 })),
      'ColmapView Hub returned an invalid link.', 'rejected', 0],
    ['a delete link on another host', () => Promise.resolve(Response.json({ url: `${HUB}/Name`, managementPath: 'https://elsewhere.example/hub/manage/Name' }, { status: 201 })),
      'ColmapView Hub returned an invalid link.', 'rejected', 0],
    ['a delete link outside /hub/manage/', () => Promise.resolve(Response.json({ url: `${HUB}/Name`, managementPath: '/hub/Name' }, { status: 201 })),
      'ColmapView Hub returned an invalid link.', 'rejected', 0],
    ['a malformed delete link', () => Promise.resolve(Response.json({ url: `${HUB}/Name`, managementPath: 'https://[' }, { status: 201 })),
      'ColmapView Hub returned an invalid link.', 'rejected', 0],
  ] as const)('maps %s', async (_name, respond, message, kind, retryAfterMs) => {
    vi.stubGlobal('fetch', vi.fn(respond));
    await expect(requestHubLink(HUB, payload)).rejects.toMatchObject({ message, kind, retryAfterMs });
  });

  it('returns absolute links under the configured Hub', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'HappyTree', url: `${HUB}/HappyTree`, managementPath: '/hub/manage/HappyTree' }, { status: 201 })));
    await expect(requestHubLink(HUB, payload)).resolves.toEqual(link);
  });

  it('posts the payload unchanged, local viewer links included, to the configured Hub', async () => {
    const local = { ...payload, viewerUrl: 'http://localhost:5173/?url=https%3A%2F%2Fstorage.example%2Fscene.zip' };
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ id: 'HappyTree', url: `${HUB}/HappyTree`, managementPath: '/hub/manage/HappyTree' }, { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    await requestHubLink(HUB, local);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${HUB}/api/links`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(local);
  });
});
