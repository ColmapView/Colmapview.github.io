import { cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImageData } from './useImageGalleryViewModel';

vi.mock('./ImageGalleryItems', () => ({
  GalleryItem: vi.fn((props: ItemProps) => (
    <div
      data-testid={`gallery-item-${props.img.imageId}`}
      data-back={String(props.wouldGoBack)}
      data-blink={String(props.matchesBlink)}
      data-color={props.matchesColor}
      data-deleted={String(props.isMarkedForDeletion)}
      data-matched={String(props.isMatched)}
      data-resizing={String(props.isResizing)}
      data-scrolling={String(props.isScrolling)}
      data-selected={String(props.isSelected)}
      data-settling={String(props.isSettling)}
      data-touch={String(props.touchMode)}
    />
  )),
  ListItem: vi.fn((props: ItemProps) => (
    <div
      data-testid={`list-item-${props.img.imageId}`}
      data-back={String(props.wouldGoBack)}
      data-blink={String(props.matchesBlink)}
      data-color={props.matchesColor}
      data-deleted={String(props.isMarkedForDeletion)}
      data-matched={String(props.isMatched)}
      data-resizing={String(props.isResizing)}
      data-scrolling={String(props.isScrolling)}
      data-selected={String(props.isSelected)}
      data-settling={String(props.isSettling)}
      data-touch={String(props.touchMode)}
    />
  )),
}));

import { ImageGalleryVirtualizedContent } from './ImageGalleryVirtualizedContent';

interface ItemProps {
  img: ImageData;
  isSelected: boolean;
  isMatched: boolean;
  isMarkedForDeletion: boolean;
  matchesColor: string;
  matchesBlink: boolean;
  isScrolling: boolean;
  isSettling: boolean;
  isResizing: boolean;
  wouldGoBack: boolean;
  touchMode?: boolean;
}

function createImage(imageId: number, name = `${imageId}.jpg`): ImageData {
  return {
    imageId,
    name,
    numPoints2D: 10,
    numPoints3D: 5,
    cameraId: 1,
    cameraWidth: 800,
    cameraHeight: 600,
    covisibleCount: 2,
    avgError: 0.5,
  };
}

function createVirtualizer(virtualItems: Array<{ index: number; key: string; start: number }>, totalSize = 200) {
  return {
    getTotalSize: vi.fn(() => totalSize),
    getVirtualItems: vi.fn(() => virtualItems),
    measureElement: vi.fn(),
  };
}

function renderContent(overrides = {}) {
  const rows = [
    [createImage(1), createImage(2)],
    [createImage(3)],
  ];
  const props = {
    containerRef: createRef<HTMLDivElement>(),
    viewMode: 'gallery' as const,
    rows,
    listRows: rows.flat().map((image) => [image]),
    galleryColumns: 3,
    rowVirtualizer: createVirtualizer([{ index: 0, key: 'row-0', start: 24 }]),
    listVirtualizer: createVirtualizer([{ index: 1, key: 'list-1', start: 48 }]),
    selectedImageId: 2,
    matchedImageIds: new Set([1]),
    pendingDeletions: new Set([2]),
    matchesColor: '#ff00aa',
    matchesBlink: true,
    debouncedIsScrolling: true,
    isSettling: false,
    isResizing: true,
    lastNavigationToImageId: 1,
    touchMode: true,
    onClick: vi.fn(),
    onDoubleClick: vi.fn(),
    onRightClick: vi.fn(),
    ...overrides,
  };

  render(<ImageGalleryVirtualizedContent {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ImageGalleryVirtualizedContent', () => {
  it('renders visible gallery rows and wires item state', () => {
    const props = renderContent();

    expect(screen.getByTestId('gallery-item-1')).toHaveAttribute('data-matched', 'true');
    expect(screen.getByTestId('gallery-item-1')).toHaveAttribute('data-back', 'true');
    expect(screen.getByTestId('gallery-item-2')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('gallery-item-2')).toHaveAttribute('data-deleted', 'true');
    expect(screen.getByTestId('gallery-item-2')).toHaveAttribute('data-blink', 'true');
    expect(screen.getByTestId('gallery-item-2')).toHaveAttribute('data-scrolling', 'true');
    expect(screen.getByTestId('gallery-item-2')).toHaveAttribute('data-resizing', 'true');
    expect(screen.getByTestId('gallery-item-2')).toHaveAttribute('data-touch', 'true');
    expect(screen.queryByTestId('gallery-item-3')).toBeNull();
    expect(screen.queryByTestId('list-item-2')).toBeNull();

    expect(props.rowVirtualizer.getTotalSize).toHaveBeenCalledOnce();
    expect(props.rowVirtualizer.getVirtualItems).toHaveBeenCalledOnce();
    expect(props.listVirtualizer.getVirtualItems).not.toHaveBeenCalled();
  });

  it('renders visible list rows and wires item state', () => {
    const props = renderContent({
      viewMode: 'list',
      selectedImageId: 2,
      matchedImageIds: new Set([2]),
      pendingDeletions: new Set<number>(),
      debouncedIsScrolling: false,
      isSettling: true,
      isResizing: false,
      lastNavigationToImageId: 2,
      touchMode: false,
    });

    const item = screen.getByTestId('list-item-2');
    expect(item).toHaveAttribute('data-selected', 'true');
    expect(item).toHaveAttribute('data-matched', 'true');
    expect(item).toHaveAttribute('data-deleted', 'false');
    expect(item).toHaveAttribute('data-back', 'true');
    expect(item).toHaveAttribute('data-settling', 'true');
    expect(item).toHaveAttribute('data-touch', 'false');
    expect(screen.queryByTestId('gallery-item-2')).toBeNull();

    expect(props.listVirtualizer.getTotalSize).toHaveBeenCalledOnce();
    expect(props.listVirtualizer.getVirtualItems).toHaveBeenCalledOnce();
    expect(props.rowVirtualizer.getVirtualItems).not.toHaveBeenCalled();
  });
});
