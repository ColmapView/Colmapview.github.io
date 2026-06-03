import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pauseThumbnailCache, resumeThumbnailCache } from '../../hooks/useThumbnail';
import { TIMING } from '../../theme';
import { useImageGalleryScrollSettle } from './useImageGalleryScrollSettle';

vi.mock('../../hooks/useThumbnail', () => ({
  pauseThumbnailCache: vi.fn(),
  resumeThumbnailCache: vi.fn(),
}));

const pauseThumbnailCacheMock = vi.mocked(pauseThumbnailCache);
const resumeThumbnailCacheMock = vi.mocked(resumeThumbnailCache);

beforeEach(() => {
  vi.useFakeTimers();
  pauseThumbnailCacheMock.mockClear();
  resumeThumbnailCacheMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useImageGalleryScrollSettle', () => {
  it('stays idle before any scroll has been observed', () => {
    const { result } = renderHook(
      ({ isScrolling }) => useImageGalleryScrollSettle(isScrolling),
      { initialProps: { isScrolling: false } }
    );

    expect(result.current).toBe(false);
    expect(pauseThumbnailCacheMock).not.toHaveBeenCalled();
    expect(resumeThumbnailCacheMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(TIMING.transitionBase);
    });

    expect(result.current).toBe(false);
    expect(resumeThumbnailCacheMock).not.toHaveBeenCalled();
  });

  it('pauses thumbnails immediately and resumes after scroll settles', () => {
    const { result, rerender } = renderHook(
      ({ isScrolling }) => useImageGalleryScrollSettle(isScrolling),
      { initialProps: { isScrolling: true } }
    );

    expect(result.current).toBe(true);
    expect(pauseThumbnailCacheMock).toHaveBeenCalledOnce();

    act(() => {
      rerender({ isScrolling: false });
    });

    expect(result.current).toBe(true);
    expect(resumeThumbnailCacheMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(TIMING.transitionBase);
    });

    expect(result.current).toBe(false);
    expect(resumeThumbnailCacheMock).toHaveBeenCalledOnce();
  });

  it('cancels a pending resume when scrolling restarts', () => {
    const { result, rerender } = renderHook(
      ({ isScrolling }) => useImageGalleryScrollSettle(isScrolling),
      { initialProps: { isScrolling: true } }
    );

    act(() => {
      rerender({ isScrolling: false });
    });
    act(() => {
      vi.advanceTimersByTime(TIMING.transitionBase - 1);
    });
    act(() => {
      rerender({ isScrolling: true });
    });
    act(() => {
      vi.advanceTimersByTime(TIMING.transitionBase);
    });

    expect(result.current).toBe(true);
    expect(pauseThumbnailCacheMock).toHaveBeenCalledTimes(2);
    expect(resumeThumbnailCacheMock).not.toHaveBeenCalled();
  });

  it('clears pending settle timers on unmount', () => {
    const { rerender, unmount } = renderHook(
      ({ isScrolling }) => useImageGalleryScrollSettle(isScrolling),
      { initialProps: { isScrolling: true } }
    );

    act(() => {
      rerender({ isScrolling: false });
      unmount();
      vi.advanceTimersByTime(TIMING.transitionBase);
    });

    expect(resumeThumbnailCacheMock).not.toHaveBeenCalled();
  });
});
