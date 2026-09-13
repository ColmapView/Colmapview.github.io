import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  getSelectedImageScrollTarget,
  useImageGallerySelectedImageScroll,
} from './useImageGallerySelectedImageScroll';

const images = [
  { imageId: 10 },
  { imageId: 20 },
  { imageId: 30 },
  { imageId: 40 },
  { imageId: 50 },
];

function createVirtualizer() {
  return {
    scrollToIndex: vi.fn(),
  };
}

describe('getSelectedImageScrollTarget', () => {
  it('returns the gallery row for a selected image', () => {
    expect(getSelectedImageScrollTarget({
      selectedImageId: 40,
      images,
      viewMode: 'gallery',
      galleryColumns: 3,
    })).toEqual({
      viewMode: 'gallery',
      index: 1,
    });
  });

  it('returns the list index for a selected image', () => {
    expect(getSelectedImageScrollTarget({
      selectedImageId: 40,
      images,
      viewMode: 'list',
      galleryColumns: 3,
    })).toEqual({
      viewMode: 'list',
      index: 3,
    });
  });

  it('returns null when no selected image can be found', () => {
    expect(getSelectedImageScrollTarget({
      selectedImageId: null,
      images,
      viewMode: 'gallery',
      galleryColumns: 3,
    })).toBeNull();

    expect(getSelectedImageScrollTarget({
      selectedImageId: 99,
      images,
      viewMode: 'list',
      galleryColumns: 3,
    })).toBeNull();
  });
});

describe('useImageGallerySelectedImageScroll', () => {
  it('scrolls the gallery virtualizer to the selected image row', () => {
    const rowVirtualizer = createVirtualizer();
    const listVirtualizer = createVirtualizer();

    renderHook(() => useImageGallerySelectedImageScroll({
      selectedImageId: 50,
      images,
      viewMode: 'gallery',
      galleryColumns: 2,
      rowVirtualizer,
      listVirtualizer,
    }));

    expect(rowVirtualizer.scrollToIndex).toHaveBeenCalledWith(2, {
      align: 'center',
      behavior: 'auto',
    });
    expect(listVirtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it('scrolls the list virtualizer to the selected image index', () => {
    const rowVirtualizer = createVirtualizer();
    const listVirtualizer = createVirtualizer();

    renderHook(() => useImageGallerySelectedImageScroll({
      selectedImageId: 30,
      images,
      viewMode: 'list',
      galleryColumns: 2,
      rowVirtualizer,
      listVirtualizer,
    }));

    expect(listVirtualizer.scrollToIndex).toHaveBeenCalledWith(2, {
      align: 'center',
      behavior: 'auto',
    });
    expect(rowVirtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it('does not scroll when the selected image is missing', () => {
    const rowVirtualizer = createVirtualizer();
    const listVirtualizer = createVirtualizer();

    renderHook(() => useImageGallerySelectedImageScroll({
      selectedImageId: 99,
      images,
      viewMode: 'gallery',
      galleryColumns: 2,
      rowVirtualizer,
      listVirtualizer,
    }));

    expect(rowVirtualizer.scrollToIndex).not.toHaveBeenCalled();
    expect(listVirtualizer.scrollToIndex).not.toHaveBeenCalled();
  });
});


describe('selected image scroll identity', () => {
  it('ignores cache-only item replacements while following selection and row changes', () => {
    const rowVirtualizer = createVirtualizer();
    const listVirtualizer = createVirtualizer();
    const initialProps = {
      selectedImageId: 10 as number | null,
      images,
      viewMode: 'gallery' as 'gallery' | 'list',
      galleryColumns: 2,
      rowVirtualizer,
      listVirtualizer,
    };
    const { rerender } = renderHook(useImageGallerySelectedImageScroll, { initialProps });
    expect(rowVirtualizer.scrollToIndex).toHaveBeenCalledTimes(1);

    // File cache updates replace the gallery items without changing their order.
    const refreshedImages = images.map(image => ({ ...image, file: new File(['cached'], 'image.png') }));
    rerender({ ...initialProps, images: refreshedImages });
    expect(rowVirtualizer.scrollToIndex).toHaveBeenCalledTimes(1);

    // Selecting a different image in the same row still recenters it.
    rerender({ ...initialProps, images: refreshedImages, selectedImageId: 20 });
    expect(rowVirtualizer.scrollToIndex).toHaveBeenCalledTimes(2);
    expect(rowVirtualizer.scrollToIndex).toHaveBeenLastCalledWith(0, expect.anything());

    // Sorting/filtering can move the current selection without changing its ID.
    const reorderedImages = [...images.slice(2), ...images.slice(0, 2)];
    rerender({ ...initialProps, images: reorderedImages, selectedImageId: 20 });
    expect(rowVirtualizer.scrollToIndex).toHaveBeenLastCalledWith(2, expect.anything());
    expect(rowVirtualizer.scrollToIndex).toHaveBeenCalledTimes(3);

    rerender({ ...initialProps, selectedImageId: 50, galleryColumns: 3 });
    expect(rowVirtualizer.scrollToIndex).toHaveBeenLastCalledWith(1, expect.anything());
    rerender({ ...initialProps, selectedImageId: 50, viewMode: 'list' });
    expect(listVirtualizer.scrollToIndex).toHaveBeenLastCalledWith(4, expect.anything());
  });

  it('recenters after a column resize even when the selected row stays the same', () => {
    const rowVirtualizer = createVirtualizer();
    const listVirtualizer = createVirtualizer();
    const initialProps = {
      selectedImageId: 40,
      images,
      viewMode: 'gallery' as const,
      galleryColumns: 2,
      rowVirtualizer,
      listVirtualizer,
    };
    const { rerender } = renderHook(useImageGallerySelectedImageScroll, { initialProps });
    expect(rowVirtualizer.scrollToIndex).toHaveBeenLastCalledWith(1, expect.anything());
    rerender({ ...initialProps, galleryColumns: 3 });
    expect(rowVirtualizer.scrollToIndex).toHaveBeenCalledTimes(2);
    expect(rowVirtualizer.scrollToIndex).toHaveBeenLastCalledWith(1, expect.anything());
  });

  it('follows a selection that becomes available after a source or filter change', () => {
    const rowVirtualizer = createVirtualizer();
    const listVirtualizer = createVirtualizer();
    const initialProps = {
      selectedImageId: 50 as number | null,
      images: [] as { imageId: number }[],
      viewMode: 'gallery' as const,
      galleryColumns: 2,
      rowVirtualizer,
      listVirtualizer,
    };
    const { rerender } = renderHook(useImageGallerySelectedImageScroll, { initialProps });
    expect(rowVirtualizer.scrollToIndex).not.toHaveBeenCalled();
    rerender({ ...initialProps, images });
    expect(rowVirtualizer.scrollToIndex).toHaveBeenCalledTimes(1);
    rerender({ ...initialProps, images, selectedImageId: null });
    expect(rowVirtualizer.scrollToIndex).toHaveBeenCalledTimes(1);
    rerender({ ...initialProps, images });
    expect(rowVirtualizer.scrollToIndex).toHaveBeenCalledTimes(2);
    rerender(initialProps);
    rerender({ ...initialProps, images });
    expect(rowVirtualizer.scrollToIndex).toHaveBeenCalledTimes(3);
  });
});
