import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFile } from '../../test/builders';
import { getCameraColor } from '../../theme';
import type { ImageData } from './useImageGalleryViewModel';

const { useThumbnailMock, useMaskedThumbnailMock } = vi.hoisted(() => ({
  useThumbnailMock: vi.fn(),
  useMaskedThumbnailMock: vi.fn(),
}));

vi.mock('../../hooks/useThumbnail', () => ({
  useThumbnail: (...args: unknown[]) => useThumbnailMock(...args),
}));

vi.mock('../../hooks/useMaskedThumbnail', () => ({
  useMaskedThumbnail: (...args: unknown[]) => useMaskedThumbnailMock(...args),
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
    thumbnailDisplayMode: 'image',
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
  useThumbnailMock.mockReset();
  useMaskedThumbnailMock.mockReset();
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

  it('renders the cached mask thumbnail in mask display mode', () => {
    const imageFile = buildFile('frame.jpg');
    const maskFile = buildFile('frame.jpg.png');
    const image = createImage({ file: imageFile, maskFile });
    useThumbnailMock.mockImplementation((_file: File | undefined, key: string) => {
      if (key === 'frame.jpg') return 'image-url';
      if (key === 'mask:frame.jpg') return 'mask-url';
      return undefined;
    });

    renderListItem(image, { thumbnailDisplayMode: 'mask' });

    expect(screen.getByAltText('frame.jpg mask')).toHaveAttribute('src', 'mask-url');
    expect(screen.queryByAltText('frame.jpg')).toBeNull();
    expect(useThumbnailMock).toHaveBeenCalledWith(imageFile, 'frame.jpg', false);
    expect(useThumbnailMock).toHaveBeenCalledWith(maskFile, 'mask:frame.jpg', true);
  });

  it('renders the generated masked thumbnail in masked image display mode', () => {
    const imageFile = buildFile('frame.jpg');
    const maskFile = buildFile('frame.jpg.png');
    const image = createImage({ file: imageFile, maskFile });
    useThumbnailMock.mockImplementation((_file: File | undefined, key: string) => {
      if (key === 'frame.jpg') return 'image-url';
      if (key === 'mask:frame.jpg') return 'mask-url';
      return undefined;
    });
    useMaskedThumbnailMock.mockReturnValue('masked-url');

    renderListItem(image, { thumbnailDisplayMode: 'maskedImage' });

    const thumbnail = screen.getByAltText('frame.jpg');
    expect(thumbnail).toHaveAttribute('src', 'masked-url');
    expect(screen.queryByAltText('frame.jpg mask')).toBeNull();
    expect(useThumbnailMock).toHaveBeenCalledWith(imageFile, 'frame.jpg', false);
    expect(useThumbnailMock).toHaveBeenCalledWith(maskFile, 'mask:frame.jpg', false);
    expect(useMaskedThumbnailMock).toHaveBeenCalledWith(imageFile, maskFile, 'frame.jpg', true, false);
  });

  it('renders the generated inverse masked thumbnail in inverse masked display mode', () => {
    const imageFile = buildFile('frame.jpg');
    const maskFile = buildFile('frame.jpg.png');
    const image = createImage({ file: imageFile, maskFile });
    useThumbnailMock.mockImplementation((_file: File | undefined, key: string) => {
      if (key === 'frame.jpg') return 'image-url';
      if (key === 'mask:frame.jpg') return 'mask-url';
      return undefined;
    });
    useMaskedThumbnailMock.mockReturnValue('inverse-masked-url');

    renderListItem(image, { thumbnailDisplayMode: 'inverseMaskedImage' });

    const thumbnail = screen.getByAltText('frame.jpg');
    expect(thumbnail).toHaveAttribute('src', 'inverse-masked-url');
    expect(screen.queryByAltText('frame.jpg mask')).toBeNull();
    expect(useThumbnailMock).toHaveBeenCalledWith(imageFile, 'frame.jpg', false);
    expect(useThumbnailMock).toHaveBeenCalledWith(maskFile, 'mask:frame.jpg', false);
    expect(useMaskedThumbnailMock).toHaveBeenCalledWith(imageFile, maskFile, 'frame.jpg', true, true);
  });

  it('overlays the cached mask thumbnail in hover mask display mode', () => {
    const image = createImage({
      file: buildFile('frame.jpg'),
      maskFile: buildFile('frame.jpg.png'),
    });
    useThumbnailMock.mockImplementation((_file: File | undefined, key: string) => {
      if (key === 'frame.jpg') return 'image-url';
      if (key === 'mask:frame.jpg') return 'mask-url';
      return undefined;
    });

    renderListItem(image, { thumbnailDisplayMode: 'hoverMask' });

    expect(screen.getByAltText('frame.jpg')).toHaveAttribute('src', 'image-url');
    expect(screen.getByAltText('frame.jpg mask')).toHaveAttribute('src', 'mask-url');
    expect(screen.getByAltText('frame.jpg mask')).toHaveClass('group-hover:opacity-50');
  });
});
