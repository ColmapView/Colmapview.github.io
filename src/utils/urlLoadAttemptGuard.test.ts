import { describe, expect, it } from 'vitest';
import {
  clearUrlLoadAttempt,
  markUrlLoadAttemptStarted,
  readUnfinishedUrlLoadAttempt,
  shouldConfirmUrlAutoLoad,
} from './urlLoadAttemptGuard';

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

describe('urlLoadAttemptGuard', () => {
  it('round-trips an attempt record through storage', () => {
    const storage = fakeStorage();
    markUrlLoadAttemptStarted('https://x/dataset', storage);
    expect(readUnfinishedUrlLoadAttempt(storage)).toEqual({ url: 'https://x/dataset' });
    clearUrlLoadAttempt(storage);
    expect(readUnfinishedUrlLoadAttempt(storage)).toBeNull();
  });

  it('returns null for corrupt or missing records', () => {
    expect(readUnfinishedUrlLoadAttempt(fakeStorage())).toBeNull();
    expect(readUnfinishedUrlLoadAttempt(fakeStorage({ 'colmapview.urlLoadAttempt.v1': '{not json' }))).toBeNull();
  });

  it('is safe when storage throws (privacy mode)', () => {
    const throwing = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(readUnfinishedUrlLoadAttempt(throwing)).toBeNull();
    expect(() => markUrlLoadAttemptStarted('https://x', throwing)).not.toThrow();
    expect(() => clearUrlLoadAttempt(throwing)).not.toThrow();
  });

  it('only asks for confirmation when the unfinished attempt matches the URL', () => {
    expect(shouldConfirmUrlAutoLoad({ url: 'https://x/dataset' }, 'https://x/dataset')).toBe(true);
    expect(shouldConfirmUrlAutoLoad({ url: 'https://x/other' }, 'https://x/dataset')).toBe(false);
    expect(shouldConfirmUrlAutoLoad(null, 'https://x/dataset')).toBe(false);
  });
});
