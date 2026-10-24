import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { downloadZip, releaseArchiveDownload } from '../../utils/zipDownload';
import { createCameraVideoCache } from './cameraVideoCache';
import { MAX_CACHED_VIDEO_BYTES, type CameraVideoSource } from './types';

vi.mock('../../utils/zipDownload', () => ({ downloadZip: vi.fn(), releaseArchiveDownload: vi.fn(async () => {}) }));
const lifetime = new AbortController();
const source = (name: string): CameraVideoSource => ({ url: `https://media.test/${name}.mp4`, bytes: 3,
  width: 64, height: 80, timestamp: 0, signal: lifetime.signal });
const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(source);
const acquire = (cache: ReturnType<typeof createCameraVideoCache>, item: CameraVideoSource, signal = new AbortController().signal) => cache.acquire(item, signal, vi.fn());
beforeEach(() => { vi.mocked(downloadZip).mockImplementation(async () => new Blob(['raw'])); });
afterEach(() => vi.clearAllMocks());

function controlled(ignoreAbort = false) {
  const jobs: { url: string; signal: AbortSignal; finish(): void }[] = [];
  let active = 0, maximum = 0;
  vi.mocked(downloadZip).mockImplementation((url, _, options) => {
    active++; maximum = Math.max(maximum, active);
    const signal = options!.signal!;
    return new Promise<Blob>((resolve, reject) => {
      jobs.push({ url, signal, finish: () => resolve(new Blob(['raw'])) });
      if (!ignoreAbort) signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }).finally(() => { active--; });
  });
  return { jobs, maximum: () => maximum };
}

it('keeps current/next/previous downloads and prepared copies across navigation, then releases all files', async () => {
  const cache = createCameraVideoCache(24);
  cache.setWindow(a, [b, c]);
  const first = await acquire(cache, a);
  const prepared = { blob: new Blob(['ready']), duration: 2, mimeType: 'video/mp4', playable: true };
  first.setPrepared(prepared); await first.dispose();
  await vi.waitFor(() => expect(downloadZip).toHaveBeenCalledTimes(3));
  cache.setWindow(b, [c, a]); const next = await acquire(cache, b); await next.dispose();
  cache.setWindow(a, [b, c]); const previous = await acquire(cache, a);
  expect(previous.getPrepared()).toBe(prepared); await previous.dispose();
  expect(downloadZip).toHaveBeenCalledTimes(3); expect(releaseArchiveDownload).not.toHaveBeenCalled();
  await cache.clear(); expect(releaseArchiveDownload).toHaveBeenCalledTimes(3);
});

it('shares a recording across different matched timestamps and limits the window by byte budget', async () => {
  const cache = createCameraVideoCache(12);
  cache.setWindow(a, [{ ...a, timestamp: 1 }, b, c, d]);
  const lease = await acquire(cache, a); await lease.dispose();
  await vi.waitFor(() => expect(downloadZip).toHaveBeenCalledTimes(2));
  expect(vi.mocked(downloadZip).mock.calls.map(call => call[0])).toEqual([a.url, b.url]);
  await cache.clear(); expect(releaseArchiveDownload).toHaveBeenCalledTimes(2);
});

it('keeps the next recording ahead of the previous one when a prepared copy consumes remaining space', async () => {
  const cache = createCameraVideoCache(24);
  cache.setWindow(a, [b, c]); const first = await acquire(cache, a); await first.dispose();
  await vi.waitFor(() => expect(downloadZip).toHaveBeenCalledTimes(3));
  cache.setWindow(b, [c, a]); const selected = await acquire(cache, b);
  selected.setPrepared({ blob: new Blob(['123456789012345']), duration: 2, mimeType: 'video/mp4' });
  await selected.dispose();
  cache.setWindow(c, [b]); const next = await acquire(cache, c); await next.dispose();
  expect(downloadZip).toHaveBeenCalledTimes(3);
  await cache.clear(); expect(releaseArchiveDownload).toHaveBeenCalledTimes(3);
});

it('rejects an oversized selected clip without starting any speculative downloads', async () => {
  const cache = createCameraVideoCache(), oversized = { ...a, bytes: MAX_CACHED_VIDEO_BYTES + 1 };
  cache.setWindow(oversized, [b, c]);
  await expect(acquire(cache, oversized)).rejects.toThrow('256 MiB');
  expect(downloadZip).not.toHaveBeenCalled(); await cache.clear();
});

it('promotes an in-flight neighbor without another request and runs only one download at a time', async () => {
  const control = controlled(), cache = createCameraVideoCache();
  cache.setWindow(a, [b, c]); const first = acquire(cache, a);
  await vi.waitFor(() => expect(control.jobs).toHaveLength(1)); control.jobs[0].finish();
  const active = await first;
  await vi.waitFor(() => expect(control.jobs).toHaveLength(2));
  cache.setWindow(b, [c, a]); const next = acquire(cache, b);
  expect(control.jobs[1].signal.aborted).toBe(false); control.jobs[1].finish();
  const promoted = await next;
  expect(vi.mocked(downloadZip).mock.calls.filter(call => call[0] === b.url)).toHaveLength(1);
  await active.dispose(); await promoted.dispose(); await cache.clear();
  expect(control.maximum()).toBe(1);
});

it('interrupts a different background request for a newly selected recording', async () => {
  const control = controlled(), cache = createCameraVideoCache();
  cache.setWindow(a, [b]); const first = acquire(cache, a);
  await vi.waitFor(() => expect(control.jobs).toHaveLength(1)); control.jobs[0].finish();
  const active = await first; await active.dispose();
  await vi.waitFor(() => expect(control.jobs).toHaveLength(2));
  cache.setWindow(d, [a, b]); const next = acquire(cache, d);
  expect(control.jobs[1].signal.aborted).toBe(true);
  await vi.waitFor(() => expect(control.jobs).toHaveLength(3));
  expect(control.jobs[2].url).toBe(d.url); control.jobs[2].finish();
  const selected = await next; await selected.dispose(); await cache.clear();
  expect(control.maximum()).toBe(1);
});

it('keeps an evicted file alive until the attached player releases its lease', async () => {
  const cache = createCameraVideoCache();
  cache.setWindow(a, []); const lease = await acquire(cache, a);
  cache.setWindow(b, []);
  expect(releaseArchiveDownload).not.toHaveBeenCalled();
  await lease.dispose(); expect(releaseArchiveDownload).toHaveBeenCalledExactlyOnceWith(lease.blob);
  await cache.clear();
});

it('releases a late download after closing the window even if a transport ignores cancellation', async () => {
  const control = controlled(true), cache = createCameraVideoCache();
  cache.setWindow(a, []); const pending = acquire(cache, a);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(control.jobs).toHaveLength(1));
  const closing = cache.clear(); expect(control.jobs[0].signal.aborted).toBe(true);
  control.jobs[0].finish(); await closing; await rejected;
  expect(releaseArchiveDownload).toHaveBeenCalledOnce();
});

it('retries a failed prefetch when selected without retrying in the background forever', async () => {
  let failed = false;
  vi.mocked(downloadZip).mockImplementation(async url => {
    if (url === b.url && !failed) { failed = true; throw new Error('offline'); }
    return new Blob(['raw']);
  });
  const cache = createCameraVideoCache(); cache.setWindow(a, [b]);
  const first = await acquire(cache, a); await first.dispose();
  await vi.waitFor(() => expect(downloadZip).toHaveBeenCalledTimes(2));
  cache.setWindow(b, [a]); const retried = await acquire(cache, b); await retried.dispose();
  expect(downloadZip).toHaveBeenCalledTimes(3); await cache.clear();
});

it('pauses background downloads in a hidden tab and resumes the same bounded window', async () => {
  const control = controlled(), cache = createCameraVideoCache();
  cache.setWindow(a, [b, c]); const first = acquire(cache, a);
  await vi.waitFor(() => expect(control.jobs).toHaveLength(1)); control.jobs[0].finish();
  const active = await first; await active.dispose();
  await vi.waitFor(() => expect(control.jobs).toHaveLength(2));
  cache.setWindow(a, [b, c], false); expect(control.jobs[1].signal.aborted).toBe(true);
  await vi.waitFor(() => expect(control.jobs[1].signal.aborted).toBe(true));
  expect(downloadZip).toHaveBeenCalledTimes(2);
  cache.setWindow(a, [b, c], true);
  await vi.waitFor(() => expect(downloadZip).toHaveBeenCalledTimes(3));
  await cache.clear();
});
