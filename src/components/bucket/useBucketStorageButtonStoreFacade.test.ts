import { renderHook, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBucketStorageButtonStoreFacade } from './useBucketStorageButtonStoreFacade';

const loadFromUrl = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('../../hooks/useUrlLoader', () => ({ useUrlLoader: () => ({ loadFromUrl }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('bucket toolbar load facade', () => {
  it('delegates the exact object URL to the existing guarded URL workflow only on explicit load', () => {
    const { result } = renderHook(useBucketStorageButtonStoreFacade);
    expect(loadFromUrl).not.toHaveBeenCalled();
    result.current.loadUrl('https://bucket.example/scene.tar');
    expect(loadFromUrl).toHaveBeenCalledExactlyOnceWith('https://bucket.example/scene.tar');
  });
});
