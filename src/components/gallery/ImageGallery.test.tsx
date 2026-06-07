import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  useImageGalleryViewModelMock,
  useImageGalleryColumnResizeMock,
  useImageGalleryKeyboardNavigationMock,
  useImageGalleryScrollSettleMock,
  useImageGallerySelectedImageScrollMock,
  useImageGalleryVisibleImageFetchMock,
  useImageGalleryVirtualizersMock,
  imageGalleryVirtualizedContentMock,
} = vi.hoisted(() => ({
  useImageGalleryViewModelMock: vi.fn(),
  useImageGalleryColumnResizeMock: vi.fn(),
  useImageGalleryKeyboardNavigationMock: vi.fn(),
  useImageGalleryScrollSettleMock: vi.fn(),
  useImageGallerySelectedImageScrollMock: vi.fn(),
  useImageGalleryVisibleImageFetchMock: vi.fn(),
  useImageGalleryVirtualizersMock: vi.fn(),
  imageGalleryVirtualizedContentMock: vi.fn(),
}));

vi.mock('./useImageGalleryViewModel', () => ({
  useImageGalleryViewModel: () => useImageGalleryViewModelMock(),
  buildImageRows: (images: unknown[]) => [images],
  buildListRows: (images: unknown[]) => images.map((image) => [image]),
}));

vi.mock('./useImageGalleryColumnResize', () => ({
  useImageGalleryColumnResize: (...args: unknown[]) => useImageGalleryColumnResizeMock(...args),
}));

vi.mock('./useImageGalleryKeyboardNavigation', () => ({
  useImageGalleryKeyboardNavigation: (...args: unknown[]) => useImageGalleryKeyboardNavigationMock(...args),
}));

vi.mock('./useImageGalleryScrollSettle', () => ({
  useImageGalleryScrollSettle: (...args: unknown[]) => useImageGalleryScrollSettleMock(...args),
}));

vi.mock('./useImageGallerySelectedImageScroll', () => ({
  useImageGallerySelectedImageScroll: (...args: unknown[]) => useImageGallerySelectedImageScrollMock(...args),
}));

vi.mock('./useImageGalleryVisibleImageFetch', () => ({
  useImageGalleryVisibleImageFetch: (...args: unknown[]) => useImageGalleryVisibleImageFetchMock(...args),
}));

vi.mock('./useImageGalleryVirtualizers', () => ({
  useImageGalleryVirtualizers: (...args: unknown[]) => useImageGalleryVirtualizersMock(...args),
}));

vi.mock('./ImageGalleryVirtualizedContent', () => ({
  ImageGalleryVirtualizedContent: (props: { hideImageOverlay: boolean }) => {
    imageGalleryVirtualizedContentMock(props);
    return (
      <div
        data-testid="image-gallery-content"
        data-hide-image-overlay={String(props.hideImageOverlay)}
      />
    );
  },
}));

import { ImageGallery } from './ImageGallery';

function createImageGalleryViewModel(overrides: Record<string, unknown> = {}) {
  return {
    cameraFilter: 'all',
    cameras: [{ cameraId: 1, width: 800, height: 600 }],
    dataset: {},
    galleryColumns: 3,
    handleClick: vi.fn(),
    handleDoubleClick: vi.fn(),
    handleRightClick: vi.fn(),
    hideImageOverlay: false,
    hideToolbar: false,
    images: [{
      imageId: 1,
      name: 'image.jpg',
      cameraId: 1,
      cameraWidth: 800,
      cameraHeight: 600,
      numPoints2D: 0,
      numPoints3D: 0,
      covisibleCount: 0,
      avgError: 0,
    }],
    isSettling: false,
    lastNavigationToImageId: null,
    matchedImageIds: new Set<number>(),
    matchesColor: '#ff00ff',
    matchesDisplayMode: 'static',
    pendingDeletions: new Set<number>(),
    reconstruction: {},
    refreshImageCacheVersion: vi.fn(),
    selectedImageId: null,
    setCameraFilter: vi.fn(),
    setGalleryColumns: vi.fn(),
    setSortDirection: vi.fn(),
    setSortField: vi.fn(),
    setViewMode: vi.fn(),
    showMatches: false,
    showSplatMetrics: false,
    sortDirection: 'asc',
    sortField: 'name',
    touchMode: false,
    viewMode: 'gallery',
    ...overrides,
  };
}

function createVirtualizer() {
  return {
    getTotalSize: vi.fn(() => 0),
    getVirtualItems: vi.fn(() => []),
    measureElement: vi.fn(),
  };
}

beforeEach(() => {
  useImageGalleryViewModelMock.mockReturnValue(createImageGalleryViewModel());
  useImageGalleryScrollSettleMock.mockReturnValue(false);
  useImageGalleryVirtualizersMock.mockReturnValue({
    rowVirtualizer: createVirtualizer(),
    listVirtualizer: createVirtualizer(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ImageGallery', () => {
  it('keeps a stable top toolbar slot when the toolbar is visible', () => {
    render(<ImageGallery />);

    expect(screen.getByTestId('image-gallery')).toHaveAttribute('data-idle-ignore', 'true');
    expect(screen.getByTestId('image-gallery-toolbar-slot')).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByTestId('image-gallery-toolbar-slot')).toHaveClass('h-10');
    expect(screen.getByTestId('image-gallery-toolbar')).toBeVisible();
    expect(screen.getByTestId('image-gallery-content')).toHaveAttribute('data-hide-image-overlay', 'false');
  });

  it('keeps gallery toolbar controls visible when image overlays are hidden', () => {
    useImageGalleryViewModelMock.mockReturnValue(createImageGalleryViewModel({
      hideImageOverlay: true,
    }));

    render(<ImageGallery />);

    expect(screen.getByTestId('image-gallery-toolbar-slot')).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByTestId('image-gallery-toolbar-slot')).toHaveClass('h-10');
    expect(screen.getByTestId('image-gallery-toolbar')).toBeVisible();
    expect(screen.getByTestId('image-gallery-content')).toHaveAttribute('data-hide-image-overlay', 'true');
  });
});
