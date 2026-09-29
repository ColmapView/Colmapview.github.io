import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HubClient } from '../huggingface/hubClient';
import { HfError } from '../huggingface/http';
import { createPublicationController } from './publishDataset';
import { MAX_PUBLICATION_BATCH_BYTES, type PreparedPublication } from './types';
import { createIdentityEuler } from '../../utils/sim3dTransforms';

const details = { name: 'scene', title: 'Scene', description: 'Test dataset', license: 'cc-by-4.0' };
function fixture(count = 3): PreparedPublication {
  return { operationId: 'test-operation', sourceKey: 'source', modelRevision: 1, counts: { cameras: 1, images: 1, points: 1 },
    imageNameToPath: {}, splatPaths: [], viewerBaseUrl: 'https://viewer.example/',
    viewerState: { version: 1, viewerVersion: 'test', viewState: null, config: { transform: createIdentityEuler() } },
    assets: Array.from({ length: count }, (_, index) => ({ path: `sparse/0/${index}.bin`, kind: 'colmap' as const, size: 1,
      open: async () => new Blob(['x']) })) };
}
function setup() {
  let commit = 1;
  const client: HubClient = { create: vi.fn().mockResolvedValue('a'.repeat(40)), head: vi.fn(),
    upload: vi.fn().mockImplementation(async () => (++commit).toString(16).padStart(40, '0')),
    reconcile: vi.fn().mockResolvedValue(null), files: vi.fn(), resolveRevision: vi.fn() };
  const verify = vi.fn().mockResolvedValue(undefined);
  return { client, verify, controller: createPublicationController(client, verify) };
}
beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => vi.unstubAllGlobals());

describe('publication controller', () => {
  it('prepares, then commits data and metadata and verifies before success in one publish', async () => {
    const { controller, client, verify } = setup();
    const work = vi.fn(async () => {
      expect(controller.getSnapshot().phase).toBe('preparing');
      expect(client.create).not.toHaveBeenCalled();
      return fixture();
    });
    await controller.publish('owner', details, work);
    expect(work).toHaveBeenCalledOnce();
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.upload).toHaveBeenCalledTimes(2);
    expect(verify).toHaveBeenCalledTimes(1);
    const state = controller.getSnapshot();
    expect(state.phase).toBe('completed');
    expect(state.canRetry).toBe(false);
    expect(state.receipt?.dataCommit).not.toBe(state.receipt?.metadataCommit);
    expect(state.receipt?.repoId).toBe('owner/scene');
    expect(state.filesDone).toBe(3);
  });

  it('bounds file batches and ignores a duplicate publish click', async () => {
    const { controller, client } = setup();
    const work = vi.fn(async () => fixture(110));
    await Promise.all([controller.publish('owner', details, work), controller.publish('owner', details, work)]);
    expect(work).toHaveBeenCalledOnce();
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.upload).toHaveBeenCalledTimes(4);
    for (const call of vi.mocked(client.upload).mock.calls) expect(call[1].length).toBeLessThanOrEqual(50);
  });

  it.each([false, true])('uploads a large PLY alone and retries the same Blob (unknown size: %s)', async unknown => {
    const { controller, client } = setup();
    const prepared = fixture(2);
    const large = new Blob(['ply']);
    Object.defineProperty(large, 'size', { value: MAX_PUBLICATION_BATCH_BYTES * 10 });
    const open = vi.fn().mockResolvedValue(large);
    prepared.assets.splice(1, 0, { path: 'splats/large.ply', kind: 'splat', size: unknown ? null : large.size, open });
    vi.mocked(client.upload).mockResolvedValueOnce('b'.repeat(40)).mockRejectedValueOnce(new HfError('Transfer stalled'));
        await controller.publish('owner', details, async () => prepared);
    expect(controller.getSnapshot().phase).toBe('failed');
    await controller.retry();
    expect(controller.getSnapshot().phase).toBe('completed');
    expect(open).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(client.upload).mock.calls;
    expect(calls).toHaveLength(5); // Small file, failed PLY, retried PLY, small file, metadata.
    for (const call of calls.slice(1, 3)) {
      expect(call[1].map(file => file.path)).toEqual(['splats/large.ply', 'colmapview-upload.json']);
      expect(call[1][0].content).toBe(large);
    }
    expect(controller.getSnapshot().bytesDone).toBe(large.size + 2);
  });

  it('batches remote files of unknown size instead of committing each one alone', async () => {
    const { controller, client } = setup();
    const prepared = fixture();
    for (let index = 0; index < 5; index++) {
      prepared.assets.push({ path: `images/${index}.jpg`, kind: 'image', size: null, open: async () => new Blob(['jpeg']) });
    }
        await controller.publish('owner', details, async () => prepared);
    expect(controller.getSnapshot().phase).toBe('completed');
    const calls = vi.mocked(client.upload).mock.calls;
    expect(calls).toHaveLength(2); // All data files, then metadata.
    expect(calls[0][1].map(file => file.path)).toEqual(['sparse/0/0.bin', 'sparse/0/1.bin', 'sparse/0/2.bin',
      'images/0.jpg', 'images/1.jpg', 'images/2.jpg', 'images/3.jpg', 'images/4.jpg', 'colmapview-upload.json']);
  });

  it('carries an unknown-size file that would overflow a batch into the next one without reopening it', async () => {
    const { controller, client } = setup();
    const prepared = fixture(1);
    const nearlyFull = new Blob(['a']);
    Object.defineProperty(nearlyFull, 'size', { value: MAX_PUBLICATION_BATCH_BYTES - 10 });
    const overflow = new Blob(['b'.repeat(100)]);
    const openOverflow = vi.fn().mockResolvedValue(overflow);
    prepared.assets.push({ path: 'images/a.jpg', kind: 'image', size: null, open: async () => nearlyFull },
      { path: 'images/b.jpg', kind: 'image', size: null, open: openOverflow });
        await controller.publish('owner', details, async () => prepared);
    expect(controller.getSnapshot().phase).toBe('completed');
    const batches = vi.mocked(client.upload).mock.calls.map(call => call[1].map(file => file.path));
    expect(batches.slice(0, 2)).toEqual([['sparse/0/0.bin', 'images/a.jpg', 'colmapview-upload.json'], ['images/b.jpg', 'colmapview-upload.json']]);
    expect(openOverflow).toHaveBeenCalledTimes(1);
  });

  it('reconciles a commit that succeeded after a timeout without uploading it again', async () => {
    const { controller, client } = setup();
    vi.mocked(client.upload).mockRejectedValueOnce(new HfError('Uncertain commit'));
    vi.mocked(client.reconcile).mockResolvedValueOnce('b'.repeat(40));
        await controller.publish('owner', details, async () => fixture());
    expect(controller.getSnapshot().phase).toBe('completed');
    expect(client.upload).toHaveBeenCalledTimes(2);
    expect(vi.mocked(client.upload).mock.calls[1][2]).toBe('b'.repeat(40));
  });

  it('retries metadata without reuploading confirmed data', async () => {
    const { controller, client } = setup();
    vi.mocked(client.upload).mockResolvedValueOnce('b'.repeat(40)).mockRejectedValueOnce(new HfError('Metadata failed')).mockResolvedValueOnce('c'.repeat(40));
    const prepared = fixture();
    const preview = new Blob(['reviewed preview'], { type: 'image/png' });
    prepared.previewPath = 'colmapview-preview.png';
    prepared.assets.push({ path: prepared.previewPath, kind: 'preview', size: preview.size, open: async () => preview });
        await controller.publish('owner', details, async () => prepared);
    expect(controller.getSnapshot().phase).toBe('failed');
    expect(controller.getSnapshot().uncertain).toBe(true);
    expect(controller.getSnapshot().canRetry).toBe(true);
    controller.reset();
    expect(controller.getSnapshot().phase).toBe('failed');
    await controller.retry();
    expect(controller.getSnapshot().phase).toBe('completed');
    expect(client.upload).toHaveBeenCalledTimes(3);
    const retriedPaths = vi.mocked(client.upload).mock.calls[2][1].map(file => file.path);
    expect(retriedPaths).toContain('colmapview.json');
    expect(retriedPaths.some(path => path.startsWith('sparse/'))).toBe(false);
    expect(retriedPaths).not.toContain(prepared.previewPath);
    expect(vi.mocked(client.upload).mock.calls[0][1].find(file => file.path === prepared.previewPath)?.content).toBe(preview);
    const readme = vi.mocked(client.upload).mock.calls[2][1].find(file => file.path === 'README.md')!;
    expect(await readme.content.text()).toContain(`![Dataset preview](https://huggingface.co/datasets/owner/scene/resolve/${'b'.repeat(40)}/colmapview-preview.png)`);
  });

  it('keeps an unverified result out of success and retries only verification', async () => {
    const { controller, client, verify } = setup();
    verify.mockRejectedValueOnce(new HfError('Not yet readable'));
        await controller.publish('owner', details, async () => fixture());
    expect(controller.getSnapshot().receipt).toBeUndefined();
    expect(controller.getSnapshot().phase).toBe('failed');
    await controller.retry();
    expect(controller.getSnapshot().phase).toBe('completed');
    expect(client.upload).toHaveBeenCalledTimes(2);
  });

  it('cancels without a success result when an in-flight commit finishes', async () => {
    const { controller, client, verify } = setup();
    let finish!: (value: string) => void;
    vi.mocked(client.upload).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const pending = controller.publish('owner', details, async () => fixture());
    await vi.waitFor(() => expect(client.upload).toHaveBeenCalledTimes(1));
    controller.cancel(); finish('b'.repeat(40)); await pending;
    expect(controller.getSnapshot().phase).toBe('cancelled');
    expect(controller.getSnapshot().repoUrl).toBeTruthy();
    expect(controller.getSnapshot().receipt).toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
  });

  const abortableUpload: HubClient['upload'] = (_repo, _files, _parent, _marker, signal) =>
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));

  it('allows a new publication after cancelling an upload the repository confirms was not committed', async () => {
    const { controller, client } = setup();
    vi.mocked(client.upload).mockImplementationOnce(abortableUpload);
        const pending = controller.publish('owner', details, async () => fixture());
    await vi.waitFor(() => expect(client.upload).toHaveBeenCalledTimes(1));
    controller.cancel(); await pending;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'cancelled', uncertain: false });
    controller.reset();
    expect(controller.getSnapshot().phase).toBe('idle');
  });

  it('keeps a cancelled upload uncertain when the repository cannot be checked', async () => {
    const { controller, client } = setup();
    vi.mocked(client.upload).mockImplementationOnce(abortableUpload);
    vi.mocked(client.reconcile).mockRejectedValueOnce(new HfError('Offline'));
        const pending = controller.publish('owner', details, async () => fixture());
    await vi.waitFor(() => expect(client.upload).toHaveBeenCalledTimes(1));
    controller.cancel(); await pending;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'cancelled', uncertain: true });
    controller.reset();
    expect(controller.getSnapshot().phase).toBe('cancelled');
  });

  it('allows abandoning a retry once the earlier unchecked attempt is confirmed absent', async () => {
    const { controller, client } = setup();
    vi.mocked(client.upload).mockRejectedValueOnce(new HfError('Transfer stalled'));
    vi.mocked(client.reconcile).mockRejectedValueOnce(new HfError('Offline'))
      .mockImplementationOnce(async () => { controller.cancel(); return null; });
        await controller.publish('owner', details, async () => fixture());
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', uncertain: true });
    await controller.retry();
    expect(client.upload).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'cancelled', uncertain: false });
  });

  it('reconciles an uncertain old job after a source switch without resuming writes', async () => {
    const { controller, client } = setup();
    vi.mocked(client.upload).mockRejectedValueOnce(new HfError('Uncertain commit'));
    vi.mocked(client.reconcile).mockRejectedValueOnce(new HfError('Offline')).mockResolvedValueOnce('b'.repeat(40));
    await controller.publish('owner', details, async () => fixture());
    controller.invalidate(); await controller.retry();
    expect(client.upload).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'cancelled', uncertain: false, canRetry: false });
    controller.reset(); expect(controller.getSnapshot().phase).toBe('idle');
  });

  it.each([new HfError('Exists', 409), { statusCode: 409 }])('requires a new destination after a repository conflict: %j', async error => {
    const { controller, client } = setup();
    vi.mocked(client.create).mockRejectedValueOnce(error);
    await controller.publish('owner', details, async () => fixture());
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: false, uncertain: false, repoUrl: undefined });
    expect(controller.getSnapshot().error).toBeTruthy();
    expect(client.upload).not.toHaveBeenCalled();
    await controller.retry();
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it('publishes under another name right after the first name was taken', async () => {
    const { controller, client } = setup();
    vi.mocked(client.create).mockRejectedValueOnce(new HfError('Exists', 409));
    await controller.publish('owner', details, async () => fixture());
    await controller.publish('owner', { ...details, name: 'other-scene' }, async () => fixture());
    expect(controller.getSnapshot()).toMatchObject({ phase: 'completed', error: undefined });
    expect(controller.getSnapshot().receipt?.repoId).toBe('owner/other-scene');
  });

  it('checks the details before preparing anything', async () => {
    const { controller, client } = setup();
    const work = vi.fn(async () => fixture());
    await controller.publish('owner', { ...details, name: 'bad name!' }, work);
    expect(work).not.toHaveBeenCalled();
    expect(client.create).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle', canRetry: false });
    expect(controller.getSnapshot().error).toBeTruthy();
  });

  it('returns to the form with the error when preparation fails, and publishes on the next attempt', async () => {
    const { controller, client } = setup();
    await controller.publish('owner', details, async () => { throw new HfError('Original image a.jpg is missing.'); });
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: false, repoUrl: undefined, error: 'Original image a.jpg is missing.' });
    expect(client.create).not.toHaveBeenCalled();
    await controller.publish('owner', details, async () => fixture());
    expect(controller.getSnapshot().phase).toBe('completed');
  });

  it('cancels during preparation without creating a repository', async () => {
    const { controller, client } = setup();
    const pending = controller.publish('owner', details, signal =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))));
    await vi.waitFor(() => expect(controller.getSnapshot().phase).toBe('preparing'));
    controller.cancel(); await pending;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'cancelled', canRetry: false, uncertain: false });
    expect(client.create).not.toHaveBeenCalled();
  });

  it('allows a new destination after a confirmed foreign commit without retrying the old write', async () => {
    const { controller, client } = setup();
    vi.mocked(client.upload).mockRejectedValueOnce(new HfError('Changed parent', 409));
    vi.mocked(client.reconcile).mockRejectedValueOnce(new HfError('Changed parent', 409));
    await controller.publish('owner', details, async () => fixture());
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', uncertain: false, canRetry: false });
    await controller.retry();
    expect(client.upload).toHaveBeenCalledTimes(1);
    controller.reset();
    await controller.publish('owner', { ...details, name: 'new-scene' }, async () => fixture());
    expect(controller.getSnapshot().receipt?.repoId).toBe('owner/new-scene');
  });
});
