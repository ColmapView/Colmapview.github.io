import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHubClient, commitTitle } from './hubClient';
import { HfError } from './http';
import { TRANSFER_IDLE_TIMEOUT_MS } from './transferTimeout';

const sdk = vi.hoisted(() => ({ createRepo: vi.fn(), listCommits: vi.fn(), uploadFilesWithProgress: vi.fn(), datasetInfo: vi.fn(), listFiles: vi.fn() }));
vi.mock('@huggingface/hub', () => sdk);
const parent = 'a'.repeat(40);
const next = 'b'.repeat(40);
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('Blob', NodeBlob);
  sdk.listCommits.mockImplementation(async function* () { yield { oid: parent, title: 'initial' }; });
  sdk.datasetInfo.mockResolvedValue({ private: false, gated: false });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Hugging Face transport adapter', () => {
  it('reads the async generator return value as the commit ID', async () => {
    sdk.uploadFilesWithProgress.mockImplementation(async function* () {
      yield { event: 'phase', phase: 'committing' };
      return { commit: { oid: next, url: 'https://huggingface.co/' }, hookOutput: '' };
    });
    const token = vi.fn().mockReturnValue('test-token');
    const client = createHubClient(token);
    expect(await client.upload('owner/scene', [{ path: 'file.bin', content: new Blob(['data']) }], parent, 'operation:0', signal(), vi.fn())).toBe(next);
    expect(token).toHaveBeenCalledWith('owner');
    expect(sdk.uploadFilesWithProgress).toHaveBeenCalledWith(expect.objectContaining({ parentCommit: parent, repo: { type: 'dataset', name: 'owner/scene' }, useXet: false }));
  });

  it('does not overwrite an unexpected parent revision', async () => {
    const client = createHubClient(() => 'test-token');
    await expect(client.upload('owner/scene', [], next, 'operation:0', signal(), vi.fn())).rejects.toThrow('changed');
    expect(sdk.uploadFilesWithProgress).not.toHaveBeenCalled();
  });

  it('stops waiting if the SDK upload stalls after cancellation', async () => {
    const controller = new AbortController();
    sdk.uploadFilesWithProgress.mockReturnValue({ next: () => new Promise(() => undefined) });
    const pending = createHubClient(() => 'test-token').upload('owner/scene', [], parent, 'operation:0', controller.signal, vi.fn());
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(sdk.uploadFilesWithProgress).toHaveBeenCalled());
    controller.abort();
    await rejected;
    expect(sdk.uploadFilesWithProgress.mock.calls[0][0].abortSignal.aborted).toBe(true);
  });

  it('allows active uploads beyond 15 minutes and displays their file progress', async () => {
    vi.useFakeTimers();
    sdk.uploadFilesWithProgress.mockImplementation(async function* () {
      for (const progress of [0.25, 0.5, 0.75]) {
        await new Promise(resolve => setTimeout(resolve, 10 * 60_000));
        yield { event: 'fileProgress', path: 'splats/large.ply', progress, state: 'uploading' };
      }
      return { commit: { oid: next } };
    });
    const progress = vi.fn();
    const pending = createHubClient(() => 'test-token').upload('owner/scene', [], parent, 'operation:0', signal(), progress);
    const result = expect(pending).resolves.toBe(next);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    await result;
    expect(progress.mock.calls.map(call => call[0])).toEqual([
      'Uploading splats/large.ply (25%)', 'Uploading splats/large.ply (50%)', 'Uploading splats/large.ply (75%)',
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts an upload that makes no progress for 15 minutes', async () => {
    vi.useFakeTimers();
    sdk.uploadFilesWithProgress.mockReturnValue({ next: () => new Promise(() => undefined) });
    const pending = createHubClient(() => 'test-token').upload('owner/scene', [], parent, 'operation:0', signal(), vi.fn());
    const result = expect(pending).rejects.toThrow('stalled for 15 minutes');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(TRANSFER_IDLE_TIMEOUT_MS);
    await result;
    expect(sdk.uploadFilesWithProgress.mock.calls[0][0].abortSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['private', 'public'] as const)('recovers a lost %s create response only with its exact operation and visibility', async visibility => {
    sdk.createRepo.mockRejectedValue(new HfError('Lost response'));
    sdk.datasetInfo.mockResolvedValue({ private: visibility === 'private', gated: false });
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: 2, operationId: 'op', repoId: 'owner/scene', visibility })));
    vi.stubGlobal('fetch', request);
    const client = createHubClient(() => 'test-token');
    await expect(client.create('owner/scene', 'op', visibility, signal())).resolves.toBe(parent);
    expect(sdk.createRepo).toHaveBeenCalledWith(expect.objectContaining({ visibility }));
    expect(sdk.listCommits).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'test-token' }));
    expect(new Headers(request.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer test-token');
  });

  it('does not adopt a similarly named existing repository', async () => {
    sdk.createRepo.mockRejectedValue(new HfError('Exists', 409));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: 1, operationId: 'someone-else', repoId: 'owner/scene' }))));
    await expect(createHubClient(() => 'test-token').create('owner/scene', 'op', 'private', signal())).rejects.toMatchObject({ status: 409 });
  });

  it.each(['private', 'public'] as const)('lists the full pinned inventory with %s verification access', async visibility => {
    sdk.listFiles.mockImplementation(async function* () {
      yield { type: 'file', path: 'masks/a.png', size: 3, oid: 'blob' };
      yield { type: 'directory', path: 'masks/nested', size: 0 };
    });
    const client = createHubClient(() => 'test-token');
    await expect(client.files('owner/scene', parent, visibility, signal())).resolves.toEqual([{ path: 'masks/a.png', size: 3, oid: 'blob' }]);
    expect(sdk.listFiles).toHaveBeenCalledWith(expect.objectContaining({ revision: parent, recursive: true }));
    const request = vi.fn().mockResolvedValue(new Response('[]'));
    vi.stubGlobal('fetch', request);
    await sdk.listFiles.mock.calls[0][0].fetch(`https://huggingface.co/api/datasets/owner/scene/tree/${parent}`);
    expect(new Headers(request.mock.calls[0][1].headers).get('Authorization')).toBe(visibility === 'private' ? 'Bearer test-token' : null);
  });

  it('requires the atomic receipt as well as the commit marker and parent', async () => {
    sdk.listCommits.mockImplementation(async function* () {
      yield { oid: next, title: commitTitle('op:0') };
      yield { oid: parent, title: 'initial' };
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('exact receipt')));
    const client = createHubClient(() => 'test-token');
    await expect(client.reconcile('owner/scene', parent, 'op:0', 'exact receipt', signal())).resolves.toBe(next);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('different receipt')));
    await expect(client.reconcile('owner/scene', parent, 'op:0', 'exact receipt', signal())).rejects.toThrow('changed');
  });

  it.each(['private', 'public'] as const)('rejects a destination changed from %s access', async visibility => {
    sdk.datasetInfo.mockResolvedValue({ private: visibility !== 'private', gated: false });
    await expect(createHubClient(() => 'test-token').assertVisibility('owner/scene', visibility, signal())).rejects.toMatchObject({ permanent: true });
  });

  it('checks current visibility with an authenticated uncached metadata request', async () => {
    sdk.datasetInfo.mockImplementation(async ({ fetch: request }) => (await request('https://huggingface.co/api/datasets/owner/scene/revision/HEAD')).json());
    const request = vi.fn().mockResolvedValue(Response.json({ private: true, gated: false }));
    const token = vi.fn().mockReturnValue('test-token'); vi.stubGlobal('fetch', request);
    await createHubClient(token).assertVisibility('owner/scene', 'private', signal());
    expect(token).toHaveBeenCalledWith('owner');
    expect(new Headers(request.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer test-token');
    expect(request.mock.calls[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store' });
  });

  it('does not recover a create operation whose marker records a different visibility', async () => {
    sdk.createRepo.mockRejectedValue(new HfError('Lost response'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ version: 2, operationId: 'op', repoId: 'owner/scene', visibility: 'public' })));
    await expect(createHubClient(() => 'test-token').create('owner/scene', 'op', 'private', signal())).rejects.toThrow('Lost response');
    expect(sdk.datasetInfo).not.toHaveBeenCalled();
  });

  it.each(['https://other.example/file', 'https://huggingface.co/datasets/another/scene/resolve/main/file',
    'https://huggingface.co/api/datasets/owner/other/tree/main'])('refuses to send destination credentials to %s', async url => {
    const token = vi.fn().mockReturnValue('test-token');
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    await expect(createHubClient(token).request('owner/scene', 'private', signal())(url)).rejects.toThrow('outside its repository');
    expect(token).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
  });

  it('never uses a token for public verification, even when an authorization header is supplied', async () => {
    const token = vi.fn(); const request = vi.fn().mockResolvedValue(new Response('data')); vi.stubGlobal('fetch', request);
    await createHubClient(token).request('owner/scene', 'public', signal())('https://huggingface.co/datasets/owner/scene/resolve/main/file',
      { headers: { Authorization: 'Bearer stale-token', Range: 'bytes=0-255' } });
    expect(token).not.toHaveBeenCalled();
    expect(new Headers(request.mock.calls[0][1].headers).get('Authorization')).toBeNull();
    expect(new Headers(request.mock.calls[0][1].headers).get('Range')).toBe('bytes=0-255');
  });
});
