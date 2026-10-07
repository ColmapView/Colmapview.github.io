import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hfAuth } from '../../features/huggingface/auth';
import { useHuggingFaceAccountButtonStoreFacade } from './useHuggingFaceAccountButtonStoreFacade';

afterEach(() => {
  cleanup();
  hfAuth.disconnect();
  vi.restoreAllMocks();
});

describe('useHuggingFaceAccountButtonStoreFacade', () => {
  it('follows the Hugging Face session as it changes', () => {
    const { result } = renderHook(() => useHuggingFaceAccountButtonStoreFacade());
    expect(result.current.hf.status).toBe('disconnected');
    const popup = { location: { href: '' }, closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    act(() => { void hfAuth.connect({ clientId: 'hf-test-client', redirectUri: `${window.location.origin}/hf-callback.html`, readOnly: true }); });
    expect(result.current.hf.status).toBe('connecting');
    act(() => hfAuth.disconnect());
    expect(result.current.hf.status).toBe('disconnected');
  });
});
