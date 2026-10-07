import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedFetch, HfError } from './http';

const nativeTimeout = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
afterEach(() => { if (nativeTimeout) Object.defineProperty(AbortSignal, 'timeout', nativeTimeout); });

describe('HfError', () => {
  it('keeps its status and offers a retry unless marked permanent', () => {
    expect(new HfError('Busy', 503)).toMatchObject({ name: 'HfError', message: 'Busy', status: 503, permanent: false });
    expect(new HfError('Too large', undefined, true)).toMatchObject({ status: undefined, permanent: true });
  });
});

describe('boundedFetch', () => {
  it('bounds requests on engines without AbortSignal.timeout (Safari/iOS 15.4–15.x)', async () => {
    Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true, writable: true });
    const request = vi.fn(async () => new Response('ok'));
    const response = await boundedFetch(new AbortController().signal, 20, request)('https://huggingface.co/api/whoami-v2');
    expect(await response.text()).toBe('ok');
    const signal = (request.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
    await vi.waitFor(() => expect(signal.aborted).toBe(true));
    expect(signal.reason).toMatchObject({ name: 'TimeoutError' });
  });
});
