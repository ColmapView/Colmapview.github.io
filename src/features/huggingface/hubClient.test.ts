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

  it('recovers a lost create response only with its exact operation marker', async () => {
    sdk.createRepo.mockRejectedValue(new HfError('Lost response'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: 1, operationId: 'op', repoId: 'owner/scene' }))));
    const client = createHubClient(() => 'test-token');
    await expect(client.create('owner/scene', 'op', signal())).resolves.toBe(parent);
    expect(sdk.createRepo).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'public' }));
  });

  it('does not adopt a similarly named existing repository', async () => {
    sdk.createRepo.mockRejectedValue(new HfError('Exists', 409));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: 1, operationId: 'someone-else', repoId: 'owner/scene' }))));
    await expect(createHubClient(() => 'test-token').create('owner/scene', 'op', signal())).rejects.toMatchObject({ status: 409 });
  });

  it('lists one folder and reports a missing folder as empty', async () => {
    const failing = (error: unknown) => ({ [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }) });
    sdk.listFiles.mockImplementation(async function* () {
      yield { type: 'file', path: 'masks/a.png', size: 3, oid: 'blob' };
      yield { type: 'directory', path: 'masks/nested', size: 0 };
    });
    const client = createHubClient(() => 'test-token');
    await expect(client.files('owner/source', 'sha', signal(), 'masks')).resolves.toEqual([{ path: 'masks/a.png', size: 3, oid: 'blob' }]);
    expect(sdk.listFiles).toHaveBeenCalledWith(expect.objectContaining({ path: 'masks', revision: 'sha', recursive: true }));
    sdk.listFiles.mockImplementation(() => failing(Object.assign(new Error('Missing'), { statusCode: 404 })));
    await expect(client.files('owner/source', 'sha', signal(), 'masks')).resolves.toEqual([]);
    sdk.listFiles.mockImplementation(() => failing(Object.assign(new Error('Server error'), { statusCode: 500 })));
    await expect(client.files('owner/source', 'sha', signal(), 'masks')).rejects.toThrow('Server error');
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
});
