import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStorageAccessPromptStoreFacade } from './useStorageAccessPromptStoreFacade';
import { useReconstructionStore } from '../../store';
import { offerUrlLoadRetry } from '../../appStartupRetry';
import type { UrlLoadError } from '../../types/manifest';

afterEach(() => { cleanup(); useReconstructionStore.getState().setUrlError(null); });
describe('storage access prompt store boundary', () => {
  it('withdraws the exact retry when another load clears its failure', () => {
    const { result } = renderHook(useStorageAccessPromptStoreFacade);
    const failure: UrlLoadError = { type: 'auth', message: 'Sign in', access: { provider: 'hf' } };
    act(() => { useReconstructionStore.getState().setUrlError(failure); offerUrlLoadRetry(vi.fn()); });
    expect(result.current.failure).toBe(failure);
    expect(result.current.retry).not.toBeNull();
    act(() => useReconstructionStore.getState().setUrlError(null));
    expect(result.current).toEqual({ failure: null, retry: null });
  });
});
