import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout } from './fetchWithTimeout';

describe('fetchWithTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function streamedResponse() {
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) { source = controller; },
      cancel,
    }));
    vi.stubGlobal('fetch', vi.fn(async () => response));
    return { source, cancel };
  }

  it('times out while waiting for headers', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    })));
    const rejected = expect(fetchWithTimeout('/stalled', 100)).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out and cancels a body that stalls after successful headers', async () => {
    const { cancel } = streamedResponse();
    const response = await fetchWithTimeout('/stalled-body', 100);
    const rejected = expect(response.text()).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resets the inactivity timeout on progress instead of limiting total download time', async () => {
    const { source } = streamedResponse();
    const response = await fetchWithTimeout('/slow', 100);
    const body = response.text();
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(80);
      source.enqueue(new TextEncoder().encode('a'));
      await vi.advanceTimersByTimeAsync(0);
    }
    source.close();
    await expect(body).resolves.toBe('aaaa');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates caller cancellation during body consumption', async () => {
    const { cancel } = streamedResponse();
    const controller = new AbortController();
    const response = await fetchWithTimeout('/cancel', 100, { signal: controller.signal });
    const rejected = expect(response.arrayBuffer()).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start a cancelled request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    controller.abort();
    await expect(fetchWithTimeout('/cancel', 100, { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases the timer when a caller cancels a partial download', async () => {
    const { cancel } = streamedResponse();
    const response = await fetchWithTimeout('/header-probe', 100);
    await response.body!.cancel();
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up for HEAD responses without a body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null)));
    const response = await fetchWithTimeout('/head', 100, { method: 'HEAD' });
    expect(response.body).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('discards unused bodies even when native fetch rejects cancellation after abort', async () => {
    const cancel = vi.fn(() => Promise.reject(new DOMException('BodyStreamBuffer was aborted', 'AbortError')));
    let requestSignal!: AbortSignal;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      requestSignal = init.signal;
      return new Response(new ReadableStream({ cancel }));
    }));
    const response = await fetchWithTimeout('/upload-session', 100);
    await expect(response.body!.cancel()).resolves.toBeUndefined();
    expect(requestSignal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
