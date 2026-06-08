import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    borderColorMode: 'none',
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
      cameraColorIndex: 0,
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
    metricBorderColorScale: null,
    pendingDeletions: new Set<number>(),
    reconstruction: {},
    refreshImageCacheVersion: vi.fn(),
    selectedImageId: null,
    setBorderColorMode: vi.fn(),
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
  it('shows the desktop toolbar only while the pointer is on the top gallery strip', () => {
    render(<ImageGallery />);

    expect(screen.getByTestId('image-gallery')).toHaveAttribute('data-idle-ignore', 'true');
    const toolbarSlot = screen.getByTestId('image-gallery-toolbar-slot');
    expect(toolbarSlot).toHaveAttribute('aria-hidden', 'true');
    expect(toolbarSlot).toHaveClass('absolute', 'top-0', 'h-10');
    expect(screen.queryByTestId('image-gallery-toolbar')).toBeNull();

    fireEvent.mouseEnter(toolbarSlot);

    expect(toolbarSlot).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByTestId('image-gallery-toolbar')).toBeVisible();
    expect(screen.getByTestId('image-gallery-content')).toHaveAttribute('data-hide-image-overlay', 'false');

    fireEvent.mouseLeave(toolbarSlot);

    expect(toolbarSlot).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByTestId('image-gallery-toolbar')).toBeNull();
  });

  it('keeps the desktop toolbar hover-gated when image overlays are hidden', () => {
    useImageGalleryViewModelMock.mockReturnValue(createImageGalleryViewModel({
      hideImageOverlay: true,
    }));

    render(<ImageGallery />);

    const toolbarSlot = screen.getByTestId('image-gallery-toolbar-slot');
    expect(toolbarSlot).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByTestId('image-gallery-toolbar')).toBeNull();
    expect(screen.getByTestId('image-gallery-content')).toHaveAttribute('data-hide-image-overlay', 'true');

    fireEvent.mouseEnter(toolbarSlot);

    expect(screen.getByTestId('image-gallery-toolbar')).toBeVisible();
  });

  it('keeps gallery toolbar controls visible in touch mode', () => {
    useImageGalleryViewModelMock.mockReturnValue(createImageGalleryViewModel({
      touchMode: true,
    }));

    render(<ImageGallery />);

    expect(screen.getByTestId('image-gallery-toolbar-slot')).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByTestId('image-gallery-toolbar-slot')).toHaveClass('h-10');
    expect(screen.getByTestId('image-gallery-toolbar')).toBeVisible();
  });
});
