import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anySignal, timeoutSignal } from './abortSignals';

const nativeAny = Object.getOwnPropertyDescriptor(AbortSignal, 'any');
const nativeTimeout = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');

afterEach(() => {
  if (nativeAny) Object.defineProperty(AbortSignal, 'any', nativeAny);
  if (nativeTimeout) Object.defineProperty(AbortSignal, 'timeout', nativeTimeout);
});

describe.each(['native', 'fallback'] as const)('anySignal (%s)', mode => {
  beforeEach(() => {
    // Safari/iOS < 17.4, Chrome < 116 and Firefox < 124 have no AbortSignal.any.
    if (mode === 'fallback') Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true, writable: true });
  });

  it('is already aborted, with that reason, when an input is already aborted', () => {
    const idle = new AbortController();
    const stopped = new AbortController();
    stopped.abort('stopped');
    const signal = anySignal([idle.signal, stopped.signal]);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('stopped');
  });

  it('aborts once, with the first reason, when any input aborts later', () => {
    const first = new AbortController();
    const second = new AbortController();
    const signal = anySignal([first.signal, second.signal]);
    const onAbort = vi.fn();
    signal.addEventListener('abort', onAbort);
    expect(signal.aborted).toBe(false);
    second.abort('second');
    first.abort('first');
    expect(signal.reason).toBe('second');
    expect(onAbort).toHaveBeenCalledOnce();
  });
});

it('releases its listeners from the other inputs once it aborts (fallback)', () => {
  Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true, writable: true });
  const first = new AbortController();
  const second = new AbortController();
  const add = vi.spyOn(second.signal, 'addEventListener');
  const remove = vi.spyOn(second.signal, 'removeEventListener');
  anySignal([first.signal, second.signal]);
  expect(add).toHaveBeenCalledOnce();
  const [type, listener] = add.mock.calls[0];
  first.abort();
  // The very listener it registered, so the surviving input no longer holds the combined signal.
  expect(remove).toHaveBeenCalledExactlyOnceWith(type, listener);
});

describe.each(['native', 'fallback'] as const)('timeoutSignal (%s)', mode => {
  beforeEach(() => {
    // Safari/iOS < 16 has no AbortSignal.timeout.
    if (mode === 'fallback') Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true, writable: true });
  });

  it('aborts with a TimeoutError once the time has passed', async () => {
    const signal = timeoutSignal(10);
    expect(signal.aborted).toBe(false);
    await vi.waitFor(() => expect(signal.aborted).toBe(true));
    expect(signal.reason).toMatchObject({ name: 'TimeoutError' });
  });
});
