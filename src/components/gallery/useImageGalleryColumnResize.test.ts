import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TIMING } from '../../theme';
import { useImageGalleryColumnResize } from './useImageGalleryColumnResize';

afterEach(() => {
  vi.useRealTimers();
});

describe('useImageGalleryColumnResize', () => {
  it('debounces shift-wheel gallery column updates', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const setGalleryColumns = vi.fn();

    renderHook(() => useImageGalleryColumnResize({
      containerRef: { current: container },
      galleryColumns: 4,
      setGalleryColumns,
      viewMode: 'gallery',
    }));

    container.dispatchEvent(createWheelEvent(1, true));
    container.dispatchEvent(createWheelEvent(1, true));
    expect(setGalleryColumns).not.toHaveBeenCalled();

    vi.advanceTimersByTime(TIMING.wheelDebounce);

    expect(setGalleryColumns).toHaveBeenCalledOnce();
    expect(setGalleryColumns).toHaveBeenCalledWith(6);
  });

  it('ignores non-shift wheel and list-mode wheel events', () => {
    vi.useFakeTimers();
    const galleryContainer = document.createElement('div');
    const listContainer = document.createElement('div');
    const setGalleryColumns = vi.fn();

    renderHook(() => useImageGalleryColumnResize({
      containerRef: { current: galleryContainer },
      galleryColumns: 4,
      setGalleryColumns,
      viewMode: 'gallery',
    }));
    renderHook(() => useImageGalleryColumnResize({
      containerRef: { current: listContainer },
      galleryColumns: 4,
      setGalleryColumns,
      viewMode: 'list',
    }));

    galleryContainer.dispatchEvent(createWheelEvent(1, false));
    listContainer.dispatchEvent(createWheelEvent(1, true));
    vi.advanceTimersByTime(TIMING.wheelDebounce);

    expect(setGalleryColumns).not.toHaveBeenCalled();
  });
});

function createWheelEvent(deltaY: number, shiftKey: boolean): WheelEvent {
  return new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY,
    shiftKey,
  });
}
