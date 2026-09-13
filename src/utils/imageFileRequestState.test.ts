import { describe, expect, it, vi } from 'vitest';
import { createImageFileRequestState } from './imageFileRequestState';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe('image file request lifecycle', () => {
  it('coalesces consumers; independently cancels and aborts only the last consumer', async () => {
    const state = createImageFileRequestState();
    const pending = deferred<File | null>();
    let signal!: AbortSignal;
    const loader = vi.fn(context => { signal = context.signal; return pending.promise; });
    const first = new AbortController();
    const second = new AbortController();
    const a = state.request('same', loader, { signal: first.signal });
    const b = state.request('same', loader, { signal: second.signal });
    first.abort();
    await expect(a).resolves.toBeNull();
    expect(signal.aborted).toBe(false);
    second.abort();
    await expect(b).resolves.toBeNull();
    expect(signal.aborted).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);
    pending.resolve(new File(['old'], 'old'));
    await pending.promise;
    expect(state.getCached('same')).toBeUndefined();
  });

  it('clear settles all consumers immediately and stale completion cannot overwrite or settle a replacement', async () => {
    const state = createImageFileRequestState();
    const old = deferred<File | null>();
    const newer = deferred<File | null>();
    const first = state.request('same', () => old.promise);
    const duplicate = state.request('same', () => old.promise);
    state.clear();
    await expect(Promise.all([first, duplicate])).resolves.toEqual([null, null]);
    const next = state.request('same', () => newer.promise);
    old.resolve(new File(['old'], 'old'));
    await old.promise;
    expect(state.getCached('same')).toBeUndefined();
    expect(state.isRequestPending('same')).toBe(true);
    const file = new File(['new'], 'new');
    newer.resolve(file);
    await expect(next).resolves.toBe(file);
    expect(state.getStats()).toEqual({ count: 1, sizeBytes: 3 });
  });

  it('counts unsignalled consumers and settles shared success once', async () => {
    const state = createImageFileRequestState();
    const pending = deferred<File | null>();
    const controller = new AbortController();
    const a = state.request('same', () => pending.promise, { signal: controller.signal });
    const b = state.request('same', () => pending.promise);
    controller.abort();
    const file = new File(['ok'], 'ok');
    pending.resolve(file);
    await expect(Promise.all([a, b])).resolves.toEqual([null, file]);
    expect(state.getCached('same')).toBe(file);
    state.deleteCached('same');
    expect(state.getStats()).toEqual({ count: 0, sizeBytes: 0 });
  });

  it('raises coalesced priority, handles failures, and leaves raw results transient', async () => {
    const state = createImageFileRequestState();
    const pending = deferred<File | null>();
    let priority!: () => string;
    const a = state.request('raw', context => { priority = context.getPriority; return pending.promise; }, { priority: 'prefetch' }, false);
    const b = state.request('raw', () => pending.promise, { priority: 'selected' }, false);
    expect(priority()).toBe('selected');
    const file = new File(['raw'], 'raw');
    pending.resolve(file);
    await expect(Promise.all([a, b])).resolves.toEqual([file, file]);
    expect(state.getStats().count).toBe(0);
    await expect(state.request('fail', async () => { throw Error('failed'); })).resolves.toBeNull();
    expect(state.isRequestPending('fail')).toBe(false);
  });
});

it('derives priority from live consumers and demotes nested demand when selection cancels', async () => {
  const parent = createImageFileRequestState();
  const nested = createImageFileRequestState();
  const pending = deferred<File | null>();
  let priority!: () => string;
  const background = parent.request('mask-probe', context => nested.request('mask-url', nestedContext => {
    priority = nestedContext.getPriority;
    return pending.promise;
  }, { signal: context.signal, getPriority: context.getPriority }), { priority: 'prefetch' });
  expect(priority()).toBe('prefetch');
  const selected = new AbortController();
  const foreground = parent.request('mask-probe', async () => null, { priority: 'selected', signal: selected.signal });
  expect(priority()).toBe('selected');
  selected.abort();
  await expect(foreground).resolves.toBeNull();
  expect(priority()).toBe('prefetch');
  const metric = new AbortController();
  const metricConsumer = nested.request('mask-url', async () => null, { priority: 'metric', signal: metric.signal });
  expect(priority()).toBe('metric');
  metric.abort();
  await expect(metricConsumer).resolves.toBeNull();
  expect(priority()).toBe('prefetch');
  pending.resolve(new File(['mask'], 'mask'));
  await background;
});

it('reports shared failures to every live consumer before null settlement, isolating callback exceptions', async () => {
  const state = createImageFileRequestState();
  const pending = deferred<File | null>();
  const failure = { kind: 'http', status: 429, message: 'HTTP 429 after retries' } as const;
  const firstError = vi.fn(() => { throw Error('consumer failure'); });
  const secondError = vi.fn();
  const first = state.request('shared', async context => { await pending.promise; context.reportFailure(failure); return null; }, { onError: firstError });
  const second = state.request('shared', async () => null, { onError: secondError });
  pending.resolve(null);
  await expect(Promise.all([first, second])).resolves.toEqual([null, null]);
  expect(firstError).toHaveBeenCalledExactlyOnceWith(failure);
  expect(secondError).toHaveBeenCalledExactlyOnceWith(failure);
});
