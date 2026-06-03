import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCamera, buildImage } from '../../test/builders';
import type { MatchViewLayout, SingleImageLayout, Size2D } from './imageDetailLayoutViewModel';
import { MatchImagePair, SingleImageView } from './ImageDetailViews';

const IMAGE_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const MASK_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

afterEach(() => {
  cleanup();
});

function getRenderedRoot(container: HTMLElement): HTMLElement {
  const root = container.firstElementChild;
  if (!(root instanceof HTMLElement)) {
    throw new Error('Expected ImageDetailViews to render an HTMLElement root');
  }
  return root;
}

describe('ImageDetailViews', () => {
  it('renders match-pair images and the match-line canvas when both sides are available', () => {
    const { container } = render(
      <MatchImagePair
        image={buildImage({ name: 'primary.jpg' })}
        camera={buildCamera()}
        imageSrc={IMAGE_SRC}
        matchedImage={buildImage({ imageId: 2, name: 'matched.jpg' })}
        matchedCamera={buildCamera({ cameraId: 2 })}
        matchedImageSrc={IMAGE_SRC}
        layout={buildMatchViewLayout()}
        containerSize={buildContainerSize()}
        matchLines={[{ point1: [1, 2], point2: [3, 4] }]}
        matchLineOpacity={0.5}
      />
    );

    expect(screen.getByRole('img', { name: 'primary.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'matched.jpg' })).toBeInTheDocument();
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('hides the matched match-pair surface when no matched camera is available', () => {
    const { container } = render(
      <MatchImagePair
        image={buildImage({ name: 'primary.jpg' })}
        camera={buildCamera()}
        imageSrc={IMAGE_SRC}
        matchedImage={buildImage({ imageId: 2, name: 'matched.jpg' })}
        matchedCamera={null}
        matchedImageSrc={IMAGE_SRC}
        layout={buildMatchViewLayout()}
        containerSize={buildContainerSize()}
        matchLines={[]}
        matchLineOpacity={0.5}
      />
    );

    expect(screen.getByRole('img', { name: 'primary.jpg' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'matched.jpg' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('renders the mask and wires mask interactions only when enabled', () => {
    const onMaskClick = vi.fn();
    const onMaskMouseMove = vi.fn();
    const onMaskMouseLeave = vi.fn();

    const { container } = render(
      <SingleImageView
        image={buildImage({ name: 'main.jpg' })}
        camera={buildCamera()}
        imageSrc={IMAGE_SRC}
        maskSrc={MASK_SRC}
        layout={buildSingleImageLayout()}
        containerSize={buildContainerSize()}
        isMarkedForDeletion={false}
        showPoints2D={false}
        showPoints3D={false}
        points2D={[]}
        maskMode="hover"
        splitX={0.5}
        maskEnabled
        onMaskClick={onMaskClick}
        onMaskMouseMove={onMaskMouseMove}
        onMaskMouseLeave={onMaskMouseLeave}
      />
    );

    expect(screen.getByRole('img', { name: 'main.jpg' })).toBeInTheDocument();
    expect(screen.getByAltText('mask')).toBeInTheDocument();

    const root = getRenderedRoot(container);
    expect(root).toHaveStyle({ cursor: 'pointer' });

    fireEvent.click(root);
    fireEvent.mouseMove(root);
    fireEvent.mouseLeave(root);

    expect(onMaskClick).toHaveBeenCalledOnce();
    expect(onMaskMouseMove).toHaveBeenCalledOnce();
    expect(onMaskMouseLeave).toHaveBeenCalledOnce();
  });

  it('suppresses mask rendering and mask events for deleted images', () => {
    const onMaskClick = vi.fn();

    const { container } = render(
      <SingleImageView
        image={buildImage({ name: 'deleted.jpg' })}
        camera={buildCamera()}
        imageSrc={IMAGE_SRC}
        maskSrc={MASK_SRC}
        layout={buildSingleImageLayout()}
        containerSize={buildContainerSize()}
        isMarkedForDeletion
        showPoints2D
        showPoints3D
        points2D={[]}
        maskMode="mask"
        splitX={0.5}
        maskEnabled
        onMaskClick={onMaskClick}
      />
    );

    expect(screen.getByRole('img', { name: 'deleted.jpg' })).toHaveStyle({
      filter: 'grayscale(100%)',
    });
    expect(screen.queryByAltText('mask')).not.toBeInTheDocument();

    fireEvent.click(getRenderedRoot(container));

    expect(onMaskClick).not.toHaveBeenCalled();
  });
});

function buildContainerSize(): Size2D {
  return { width: 640, height: 480 };
}

function buildSingleImageLayout(): SingleImageLayout {
  return {
    width: 320,
    height: 240,
    renderedImageWidth: 320,
    renderedImageHeight: 240,
    offsetX: 10,
    offsetY: 20,
    scaleX: 0.5,
    scaleY: 0.5,
  };
}

function buildMatchViewLayout(): MatchViewLayout {
  return {
    image1: {
      width: 300,
      height: 220,
      offsetX: 10,
      offsetY: 20,
      scaleX: 0.5,
      scaleY: 0.5,
    },
    image2: {
      width: 280,
      height: 210,
      offsetX: 330,
      offsetY: 25,
      scaleX: 0.5,
      scaleY: 0.5,
    },
  };
}
