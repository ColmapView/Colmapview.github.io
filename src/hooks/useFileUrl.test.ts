import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILE_URL_REVOKE_FALLBACK_DELAY_MS } from './fileUrlRevocationPolicy';
import { useFileUrl } from './useFileUrl';

interface HookProps {
  file: File | null | undefined;
}

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

const createObjectURL = vi.fn((file: Blob) => {
  return file instanceof File ? `blob:${file.name}` : 'blob:file';
});
const revokeObjectURL = vi.fn();

function createFile(name = 'image.jpg'): File {
  return new File(['image'], name, { type: 'image/jpeg' });
}

function restoreUrlMocks(): void {
  if (originalCreateObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    });
  } else {
    Reflect.deleteProperty(URL, 'createObjectURL');
  }

  if (originalRevokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  } else {
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestIdleCallback', undefined);
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: revokeObjectURL,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  restoreUrlMocks();
});

describe('useFileUrl', () => {
  it('returns null when no file is provided', () => {
    const { result } = renderHook(({ file }: HookProps) => useFileUrl(file), {
      initialProps: { file: null },
    });

    expect(result.current).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('creates a blob URL for the current file', () => {
    const file = createFile('image-a.jpg');
    const { result } = renderHook(({ file }: HookProps) => useFileUrl(file), {
      initialProps: { file },
    });

    expect(result.current).toBe('blob:image-a.jpg');
    expect(createObjectURL).toHaveBeenCalledWith(file);
  });

  it('returns null immediately when the file is cleared and defers URL revocation', () => {
    const file = createFile('image-b.jpg');
    const { result, rerender } = renderHook(({ file }: HookProps) => useFileUrl(file), {
      initialProps: { file },
    });

    expect(result.current).toBe('blob:image-b.jpg');

    act(() => {
      rerender({ file: null });
    });

    expect(result.current).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(FILE_URL_REVOKE_FALLBACK_DELAY_MS);
    });

    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image-b.jpg');
  });

  it('revokes pending blob URLs on unmount without waiting for the fallback timer', () => {
    const file = createFile('image-c.jpg');
    const { unmount } = renderHook(({ file }: HookProps) => useFileUrl(file), {
      initialProps: { file },
    });

    act(() => {
      unmount();
    });

    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image-c.jpg');

    act(() => {
      vi.advanceTimersByTime(FILE_URL_REVOKE_FALLBACK_DELAY_MS);
    });

    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });
});
