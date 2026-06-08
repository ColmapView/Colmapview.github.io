import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCameraColor } from '../../theme';
import type { ImageData } from './useImageGalleryViewModel';

vi.mock('../../hooks/useThumbnail', () => ({
  useThumbnail: () => undefined,
}));

vi.mock('./useImageGalleryItemStoreFacade', () => ({
  useImageGalleryItemStoreFacade: () => ({ multiCamera: true }),
}));

import { ListItem } from './ImageGalleryItems';

function createImage(overrides: Partial<ImageData> = {}): ImageData {
  return {
    imageId: 7,
    name: 'frame.jpg',
    numPoints2D: 12,
    numPoints3D: 8,
    cameraId: 2,
    cameraColorIndex: 1,
    cameraWidth: 800,
    cameraHeight: 600,
    covisibleCount: 4,
    avgError: 0.25,
    ...overrides,
  };
}

function renderListItem(
  img: ImageData,
  overrides: Partial<ComponentProps<typeof ListItem>> = {}
) {
  const props: ComponentProps<typeof ListItem> = {
    img,
    borderColorMode: 'none',
    isSelected: false,
    isMatched: false,
    isMarkedForDeletion: false,
    matchesColor: '#ff00ff',
    matchesBlink: false,
    metricBorderColorScale: null,
    onClick: vi.fn(),
    onDoubleClick: vi.fn(),
    onRightClick: vi.fn(),
    isScrolling: false,
    skipImages: false,
    isSettling: false,
    isResizing: false,
    wouldGoBack: false,
    touchMode: true,
    ...overrides,
  };

  return render(
    <ListItem
      {...props}
    />
  );
}

afterEach(() => {
  cleanup();
});

describe('ImageGallery list item', () => {
  it('renders PSNR and SSIM as one list metric column', () => {
    renderListItem(createImage({ splatPsnr: 31.24, splatSsim: 0.9428 }));

    expect(screen.getByText('31.2/0.943')).toBeInTheDocument();
    expect(screen.getByText('PSNR/SSIM')).toBeInTheDocument();
    expect(screen.getByText('pts · covis · err · psnr/ssim')).toBeInTheDocument();
    expect(screen.queryByText('PSNR')).toBeNull();
    expect(screen.queryByText('SSIM')).toBeNull();
  });

  it('keeps one PSNR/SSIM column when one side of the metric is missing', () => {
    renderListItem(createImage({ splatSsim: 0.9123 }));

    expect(screen.getByText('--/0.912')).toBeInTheDocument();
    expect(screen.getByText('PSNR/SSIM')).toBeInTheDocument();
    expect(screen.getByText('pts · covis · err · psnr/ssim')).toBeInTheDocument();
  });

  it('colors the normal list item border by camera', () => {
    const { container } = renderListItem(createImage(), {
      borderColorMode: 'camera',
    });

    expect(container.firstElementChild).toHaveStyle({
      borderColor: getCameraColor(1),
    });
  });

  it('keeps match and selection borders above base border coloring', () => {
    const matched = renderListItem(createImage(), {
      borderColorMode: 'camera',
      isMatched: true,
      matchesColor: '#ff00ff',
    });

    expect(matched.container.firstElementChild).toHaveStyle({
      borderColor: '#ff00ff',
    });

    cleanup();
    const selected = renderListItem(createImage(), {
      borderColorMode: 'camera',
      isSelected: true,
    });

    expect(selected.container.firstElementChild).toHaveClass('border-ds-accent');
    expect(selected.container.firstElementChild).not.toHaveStyle({
      borderColor: getCameraColor(1),
    });
  });
});
