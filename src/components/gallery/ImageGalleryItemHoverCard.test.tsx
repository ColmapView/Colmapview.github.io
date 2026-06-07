import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MODAL_POSITION, Z_INDEX } from '../../theme';
import { ImageGalleryItemHoverCard } from './ImageGalleryItemHoverCard';
import type { ImageData } from './useImageGalleryViewModel';

function createImage(overrides: Partial<ImageData> = {}): ImageData {
  return {
    imageId: 7,
    name: 'image-7.jpg',
    numPoints2D: 23,
    numPoints3D: 11,
    cameraId: 3,
    cameraWidth: 1024,
    cameraHeight: 768,
    covisibleCount: 5,
    avgError: 0.345,
    splatPsnr: 31.24,
    splatSsim: 0.9428,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('ImageGalleryItemHoverCard', () => {
  it('renders image stats, actions, and portal position for gallery items', () => {
    render(
      <ImageGalleryItemHoverCard
        img={createImage()}
        multiCamera
        isSelected
        isMatched
        wouldGoBack={false}
        mousePos={{ x: 100, y: 200 }}
      />
    );

    expect(screen.getByText('image-7.jpg')).toBeInTheDocument();
    expect(screen.getByText('#3:7')).toBeInTheDocument();
    expect(screen.getByText('11 3D points')).toBeInTheDocument();
    expect(screen.getByText('23 2D points')).toBeInTheDocument();
    expect(screen.getByText('5 covisible')).toBeInTheDocument();
    expect(screen.getByText('0.34 avg error')).toBeInTheDocument();
    expect(screen.getByText('31.2 dB PSNR')).toBeInTheDocument();
    expect(screen.getByText('0.943 SSIM')).toBeInTheDocument();
    expect(screen.getByText('Left: details')).toBeInTheDocument();
    expect(screen.getByText('Right: matches')).toBeInTheDocument();

    const card = screen.getByTestId('image-gallery-hover-card');
    expect(card).toHaveStyle({
      left: `${100 + MODAL_POSITION.cursorOffset}px`,
      top: `${200 + MODAL_POSITION.cursorOffset}px`,
      pointerEvents: 'none',
      zIndex: String(Z_INDEX.mouseTooltip),
    });
  });

  it('can render list-item action hints without image stats', () => {
    render(
      <ImageGalleryItemHoverCard
        img={createImage()}
        multiCamera={false}
        isSelected={false}
        isMatched={false}
        wouldGoBack
        mousePos={{ x: 10, y: 20 }}
        showStats={false}
      />
    );

    expect(screen.queryByText('image-7.jpg')).toBeNull();
    expect(screen.queryByText('#7')).toBeNull();
    expect(screen.queryByText('11 3D points')).toBeNull();
    expect(screen.queryByText('31.2 dB PSNR')).toBeNull();
    expect(screen.queryByText('0.943 SSIM')).toBeNull();
    expect(screen.getByText('Left: select')).toBeInTheDocument();
    expect(screen.getByText('Right: back')).toBeInTheDocument();
  });
});
