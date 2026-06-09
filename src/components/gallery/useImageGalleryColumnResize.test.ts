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
      container,
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

  it('handles shift-wheel events with horizontal deltas', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const setGalleryColumns = vi.fn();

    renderHook(() => useImageGalleryColumnResize({
      container,
      galleryColumns: 4,
      setGalleryColumns,
      viewMode: 'gallery',
    }));

    container.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaX: -10,
      deltaY: 0,
      shiftKey: true,
    }));
    vi.advanceTimersByTime(TIMING.wheelDebounce);

    expect(setGalleryColumns).toHaveBeenCalledOnce();
    expect(setGalleryColumns).toHaveBeenCalledWith(3);
  });

  it('attaches when the gallery element appears after the initial render', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const setGalleryColumns = vi.fn();

    const { rerender } = renderHook(
      ({ container: nextContainer }: { container: HTMLDivElement | null }) => useImageGalleryColumnResize({
        container: nextContainer,
        galleryColumns: 4,
        setGalleryColumns,
        viewMode: 'gallery',
      }),
      { initialProps: { container: null } }
    );

    rerender({ container });
    container.dispatchEvent(createWheelEvent(1, true));
    vi.advanceTimersByTime(TIMING.wheelDebounce);

    expect(setGalleryColumns).toHaveBeenCalledOnce();
    expect(setGalleryColumns).toHaveBeenCalledWith(5);
  });

  it('ignores non-shift wheel and list-mode wheel events', () => {
    vi.useFakeTimers();
    const galleryContainer = document.createElement('div');
    const listContainer = document.createElement('div');
    const setGalleryColumns = vi.fn();

    renderHook(() => useImageGalleryColumnResize({
      container: galleryContainer,
      galleryColumns: 4,
      setGalleryColumns,
      viewMode: 'gallery',
    }));
    renderHook(() => useImageGalleryColumnResize({
      container: listContainer,
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
