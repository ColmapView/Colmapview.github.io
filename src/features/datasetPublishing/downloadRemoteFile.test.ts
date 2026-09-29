import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadRemoteFile } from './downloadRemoteFile';
import { TRANSFER_IDLE_TIMEOUT_MS } from '../huggingface/transferTimeout';

beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('remote file download', () => {
  it('accepts a PLY larger than 128 MiB without assembling JS chunk arrays', async () => {
    const chunk = new Uint8Array(1024 * 1024).fill(42);
    let chunks = 129;
    const response = new Response(new ReadableStream({
      pull(controller) { if (chunks--) controller.enqueue(chunk); else controller.close(); },
    }), { headers: { 'content-length': String(129 * chunk.length) } });
    const fetch = vi.fn().mockResolvedValue(response); vi.stubGlobal('fetch', fetch);
    const result = await downloadRemoteFile('https://huggingface.co/pinned.ply', 'splats/large.ply', new AbortController().signal);
    expect(result.size).toBe(129 * chunk.length);
    expect(new Uint8Array(await result.slice(-4).arrayBuffer())).toEqual(new Uint8Array([42, 42, 42, 42]));
    expect(fetch.mock.calls[0][1].credentials).toBe('omit');
  });

  it('stops reading a size-limited file once it passes the limit, even without a declared length', async () => {
    const cancel = vi.fn();
    let pulls = 0;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({
      pull(controller) { if (++pulls > 100) controller.close(); else controller.enqueue(new Uint8Array(1024)); },
      cancel,
    }))));
    await expect(downloadRemoteFile('https://huggingface.co/pinned.jpg', 'images/large.jpg', new AbortController().signal, 4096))
      .rejects.toThrow('images/large.jpg exceeds');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(pulls).toBeLessThan(10);
  });

  it('keeps a slow download alive while bytes arrive', async () => {
    vi.useFakeTimers();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) { stream = controller; } }))));
    const pending = downloadRemoteFile('https://huggingface.co/pinned.ply', 'splats/large.ply', new AbortController().signal);
    for (let index = 0; index < 3; index++) {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      stream.enqueue(new Uint8Array([index]));
      await vi.advanceTimersByTimeAsync(0);
    }
    stream.close();
    expect(await (await pending).text()).toBe('\x00\x01\x02');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['cancel', 'stall'])('stops reading the source on %s', async action => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }))));
    const controller = new AbortController();
    const pending = downloadRemoteFile('https://huggingface.co/pinned.ply', 'splats/large.ply', controller.signal);
    const rejected = expect(pending).rejects.toThrow(action === 'stall' ? 'stalled' : /abort/i);
    await vi.advanceTimersByTimeAsync(0);
    if (action === 'stall') await vi.advanceTimersByTimeAsync(TRANSFER_IDLE_TIMEOUT_MS);
    else controller.abort();
    await rejected;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
