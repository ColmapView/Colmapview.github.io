import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pauseThumbnailCache, resumeThumbnailCache } from '../../hooks/useThumbnail';
import {
  getImageGalleryThumbnailSettlingKey,
  useImageGalleryThumbnailSettling,
  type ImageGalleryThumbnailSettlingKeyOptions,
} from './useImageGalleryThumbnailSettling';

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

describe('gallery thumbnail settling', () => {
  it('builds stable keys from gallery filter and navigation state', () => {
    expect(getImageGalleryThumbnailSettlingKey({
      cameraFilter: 'all',
      selectedImageId: null,
      sortDirection: 'asc',
      sortField: 'name',
    })).toBe('all\nname\nasc\nnone');
    expect(getImageGalleryThumbnailSettlingKey({
      cameraFilter: 2,
      selectedImageId: 10,
      sortDirection: 'desc',
      sortField: 'avgError',
    })).toBe('2\navgError\ndesc\n10');
  });

  it('pauses thumbnails while the current gallery state settles', () => {
    const { result } = renderThumbnailSettling(createKeyOptions());

    expect(result.current).toBe(true);
    expect(pauseThumbnailCacheMock).toHaveBeenCalledOnce();

    act(() => {
      vi.advanceTimersByTime(49);
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current).toBe(false);
    expect(resumeThumbnailCacheMock).toHaveBeenCalledOnce();
  });

  it('restarts the settle timer when the gallery state changes', () => {
    const { result, rerender } = renderThumbnailSettling(createKeyOptions());

    act(() => {
      vi.advanceTimersByTime(40);
      rerender({ keyOptions: createKeyOptions({ sortDirection: 'desc' }) });
    });

    expect(result.current).toBe(true);
    expect(pauseThumbnailCacheMock).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(49);
    });
    expect(result.current).toBe(true);
    expect(resumeThumbnailCacheMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current).toBe(false);
    expect(resumeThumbnailCacheMock).toHaveBeenCalledOnce();
  });

  it('does not restart the timer for equivalent gallery state', () => {
    const { rerender } = renderThumbnailSettling(createKeyOptions());

    rerender({ keyOptions: createKeyOptions() });

    expect(pauseThumbnailCacheMock).toHaveBeenCalledOnce();
  });

  it('resumes thumbnails when unmounted during settling', () => {
    const { unmount } = renderThumbnailSettling(createKeyOptions());

    act(() => {
      unmount();
      vi.advanceTimersByTime(50);
    });

    expect(resumeThumbnailCacheMock).toHaveBeenCalledOnce();
  });
});

function renderThumbnailSettling(keyOptions: ImageGalleryThumbnailSettlingKeyOptions) {
  return renderHook(
    ({ keyOptions: nextKeyOptions }: { keyOptions: ImageGalleryThumbnailSettlingKeyOptions }) =>
      useImageGalleryThumbnailSettling(nextKeyOptions, 50),
    { initialProps: { keyOptions } }
  );
}

function createKeyOptions(
  overrides: Partial<ImageGalleryThumbnailSettlingKeyOptions> = {}
): ImageGalleryThumbnailSettlingKeyOptions {
  return {
    cameraFilter: 'all',
    selectedImageId: 1,
    sortDirection: 'asc',
    sortField: 'name',
    ...overrides,
  };
}
