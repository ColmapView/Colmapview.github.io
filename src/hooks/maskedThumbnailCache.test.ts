import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMaskedThumbnailCache } from './maskedThumbnailCache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const blob = (bytes: number) => new Blob([new Uint8Array(bytes)]);
let sequence = 0;
const createUrl = vi.fn(() => `blob:${++sequence}`);
const revokeUrl = vi.fn();
beforeEach(() => {
  sequence = 0; createUrl.mockClear(); revokeUrl.mockClear();
  vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
});
afterEach(() => vi.unstubAllGlobals());

describe('masked thumbnail URL retention', () => {
  it('bounds actual inactive Blob bytes while active consumers remain pinned', async () => {
    const cache = createMaskedThumbnailCache(10);
    const a = cache.acquire('a', async () => blob(12));
    const b = cache.acquire('b', async () => blob(6));
    await Promise.all([a.ready, b.ready]);
    const aUrl = a.getUrl();
    const bUrl = b.getUrl();
    b.release();
    const c = cache.acquire('c', async () => blob(6));
    await c.ready;
    c.release();
    expect(revokeUrl).toHaveBeenCalledWith(bUrl);
    expect(revokeUrl).not.toHaveBeenCalledWith(aUrl);
    expect(cache.getStats()).toMatchObject({ inactiveBytes: 6, pinnedBytes: 12, sizeBytes: 18, evictions: 1 });
    a.release();
    expect(cache.getStats()).toMatchObject({ inactiveBytes: 0, pinnedBytes: 0, sizeBytes: 0 });
    expect(revokeUrl.mock.calls.filter(([url]) => url === aUrl)).toHaveLength(1);
    a.release();
    expect(revokeUrl).toHaveBeenCalledTimes(3);
  });

  it('refreshes inactive LRU reuse without decoding again', async () => {
    const cache = createMaskedThumbnailCache(8);
    const a = cache.acquire('a', async () => blob(4));
    await a.ready; const aUrl = a.getUrl(); a.release();
    const b = cache.acquire('b', async () => blob(4));
    await b.ready; const bUrl = b.getUrl(); b.release();
    const reload = vi.fn(async () => blob(4));
    const reused = cache.acquire('a', reload);
    await reused.ready; reused.release();
    const c = cache.acquire('c', async () => blob(4));
    await c.ready; c.release();
    expect(reload).not.toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith(bUrl);
    expect(revokeUrl).not.toHaveBeenCalledWith(aUrl);
  });

  it('keeps cleared URLs alive for both consumers and isolates same-key replacement leases', async () => {
    const cache = createMaskedThumbnailCache(10);
    const load = vi.fn(async () => blob(6));
    const first = cache.acquire('same', load);
    const second = cache.acquire('same', load);
    await Promise.all([first.ready, second.ready]);
    const oldUrl = first.getUrl();
    expect(load).toHaveBeenCalledOnce();
    cache.clear();
    expect(cache.getStats()).toMatchObject({ count: 0, retiredBytes: 6, sizeBytes: 6 });
    expect(revokeUrl).not.toHaveBeenCalled();
    const replacement = cache.acquire('same', async () => blob(4));
    await replacement.ready;
    first.release();
    expect(revokeUrl).not.toHaveBeenCalled();
    second.release();
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith(oldUrl);
    expect(replacement.getUrl()).not.toBe(oldUrl);
    expect(cache.getStats()).toMatchObject({ pinnedBytes: 4, retiredBytes: 0, count: 1 });
    replacement.release();
    cache.clear();
    expect(revokeUrl).toHaveBeenCalledTimes(2);
  });

  it('prevents late old completion from publishing or deleting a new same-key load', async () => {
    const cache = createMaskedThumbnailCache(10);
    const oldLoad = deferred<Blob>();
    const newLoad = deferred<Blob>();
    const old = cache.acquire('same', () => oldLoad.promise);
    cache.clear();
    const current = cache.acquire('same', () => newLoad.promise);
    oldLoad.resolve(blob(9));
    await expect(old.ready).resolves.toBeNull();
    expect(createUrl).not.toHaveBeenCalled();
    expect(cache.getStats().loading).toBe(1);
    const coalesced = cache.acquire('same', async () => { throw new Error('must coalesce'); });
    newLoad.resolve(blob(5));
    await Promise.all([current.ready, coalesced.ready]);
    expect(createUrl).toHaveBeenCalledOnce();
    old.release();
    current.release();
    expect(revokeUrl).not.toHaveBeenCalled();
    coalesced.release();
    cache.clear();
    expect(revokeUrl).toHaveBeenCalledOnce();
  });

  it('disposes a released oversized completion exactly once', async () => {
    const cache = createMaskedThumbnailCache(4);
    const result = deferred<Blob>();
    const lease = cache.acquire('pending', () => result.promise);
    lease.release();
    result.resolve(blob(5));
    await lease.ready;
    expect(cache.getStats()).toMatchObject({ count: 0, loading: 0, sizeBytes: 0 });
    expect(createUrl).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledOnce();
  });
});
