import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildResponse } from '../test/builders';
import { retryAfterDeadline, UrlMediaScheduler } from './urlMediaScheduler';
import type { MediaPriority } from './types';

const options = (priority: MediaPriority = 'visible', signal = new AbortController().signal) => ({ signal, getPriority: () => priority });
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const ok = () => buildResponse({ blob: async () => new Blob(['bytes']) });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('URL media scheduler', () => {
  it('holds both aggregate limits through body reads and releases slots after failures', async () => {
    const scheduler = new UrlMediaScheduler();
    const bodies: Array<() => void> = [];
    vi.stubGlobal('fetch', vi.fn(async () => buildResponse({ blob: () => new Promise<Blob>(resolve => { bodies.push(() => resolve(new Blob(['body']))); }) })));
    const pending = Array.from({ length: 20 }, (_, i) => scheduler.transfer(`https://${i < 10 ? 'a' : 'b'}.test/${i}`, options()));
    await flush();
    expect(scheduler.getStats()).toMatchObject({ active: 8, queued: 12, origins: { 'https://a.test': 4, 'https://b.test': 4 } });
    while (bodies.length || scheduler.getStats().queued) {
      bodies.splice(0).forEach(release => release());
      await flush();
      expect(scheduler.getStats().active).toBeLessThanOrEqual(8);
      expect(Object.values(scheduler.getStats().origins).every(count => count <= 4)).toBe(true);
    }
    await Promise.all(pending);
    expect(scheduler.getStats().active).toBe(0);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    await expect(scheduler.transfer('https://a.test/fail', options())).resolves.toEqual({ kind: 'failure' });
    expect(scheduler.getStats().active).toBe(0);
  });

  it('never starts cancelled queued transfers and prioritizes raised coalesced demand', async () => {
    const scheduler = new UrlMediaScheduler({ perPage: 1 });
    let release!: () => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { release = () => resolve(ok()); })).mockImplementation(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    const first = scheduler.transfer('https://a.test/active', options());
    const controller = new AbortController();
    const cancelled = scheduler.transfer('https://a.test/cancelled', options('selected', controller.signal));
    const background = scheduler.transfer('https://a.test/background', options('prefetch'));
    let priority: MediaPriority = 'prefetch';
    const raised = scheduler.transfer('https://a.test/raised', { signal: new AbortController().signal, getPriority: () => priority });
    priority = 'selected';
    controller.abort();
    release();
    await Promise.all([first, cancelled, background, raised]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['https://a.test/active', 'https://a.test/raised', 'https://a.test/background']);
    await expect(cancelled).resolves.toEqual({ kind: 'aborted' });
  });

  it('gives old background work bounded progress under sustained foreground arrivals then drains', async () => {
    const scheduler = new UrlMediaScheduler({ perPage: 1 });
    const releases: Array<() => void> = [];
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string) => { calls.push(url); return new Promise<Response>(resolve => releases.push(() => resolve(ok()))); }));
    const pending = [scheduler.transfer('https://fair.test/active', options())];
    pending.push(scheduler.transfer('https://fair.test/background', options('prefetch')));
    for (let i = 0; i < 12; i++) {
      pending.push(scheduler.transfer(`https://fair.test/selected-${i}`, options('selected')));
      releases.shift()!();
      await flush();
    }
    expect(calls.indexOf('https://fair.test/background')).toBeLessThanOrEqual(7);
    while (releases.length) { releases.shift()!(); await flush(); }
    await Promise.all(pending);
    expect(scheduler.getStats()).toMatchObject({ active: 0, queued: 0 });
  });

  it('honors server cooldowns without holding slots, lets other origins progress, and cancels waits', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = new UrlMediaScheduler({ perPage: 1 });
    const fetchMock = vi.fn(async (url: string) => url.includes('limited')
      ? buildResponse({ status: 429, headers: new Headers({ 'Retry-After': '120' }) }) : ok());
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const limited = scheduler.transfer('https://limited.test/a', options('selected', controller.signal));
    const other = scheduler.transfer('https://other.test/a', options());
    await other;
    expect(scheduler.getStats()).toMatchObject({ active: 0, queued: 1 });
    await vi.advanceTimersByTimeAsync(119_999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    controller.abort();
    await expect(limited).resolves.toEqual({ kind: 'aborted' });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses bounded jittered backoff, retries at most twice, and does not retry ordinary 4xx', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = new UrlMediaScheduler({ random: () => 0.5 });
    const fetchMock = vi.fn(async () => buildResponse({ status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = scheduler.transfer('https://rate.test/a', options());
    await flush();
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ kind: 'failure', status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mockImplementation(async () => buildResponse({ status: 401 }));
    await expect(scheduler.transfer('https://auth.test/a', options())).resolves.toEqual({ kind: 'failure', status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('keeps the later outstanding origin deadline and parses seconds/date/malformed values', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    expect(retryAfterDeadline('Thu, 01 Jan 1970 00:02:00 GMT', 0)).toBe(120_000);
    expect(retryAfterDeadline('9999999', 0)).toBe(9_999_999_000);
    expect(retryAfterDeadline('invalid', 0)).toBeNull();
    expect(retryAfterDeadline('', 0)).toBeNull();
    const scheduler = new UrlMediaScheduler();
    const fetchMock = vi.fn().mockResolvedValueOnce(buildResponse({ status: 429, headers: new Headers({ 'Retry-After': '10' }) }))
      .mockResolvedValueOnce(buildResponse({ status: 429, headers: new Headers({ 'Retry-After': '2' }) }))
      .mockImplementation(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    const a = scheduler.transfer('https://same.test/a', options());
    const b = scheduler.transfer('https://same.test/b', options());
    await flush();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([a, b]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
