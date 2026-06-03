import { describe, expect, it, vi } from 'vitest';
import { createUrlLoadGuard, URL_LOAD_GUARD_MESSAGE } from './urlLoaderLoadGuard';

describe('url loader load guard', () => {
  it('allows one active load and logs duplicate attempts', () => {
    const log = vi.fn();
    const guard = createUrlLoadGuard(log);

    expect(guard.isActive()).toBe(false);
    expect(guard.tryStart()).toBe(true);
    expect(guard.isActive()).toBe(true);
    expect(guard.tryStart()).toBe(false);
    expect(log).toHaveBeenCalledWith(URL_LOAD_GUARD_MESSAGE);

    guard.finish();

    expect(guard.isActive()).toBe(false);
    expect(guard.tryStart()).toBe(true);
  });

  it('is isolated per guard instance', () => {
    const first = createUrlLoadGuard();
    const second = createUrlLoadGuard();

    expect(first.tryStart()).toBe(true);
    expect(second.tryStart()).toBe(true);
  });
});
