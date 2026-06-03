import { createRef, type ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCamera, buildImage } from '../../test/builders';
import {
  DesktopImageDetailFrame,
  TouchImageDetailFrame,
} from './ImageDetailModalFrames';
import type { MatchViewLayout, SingleImageLayout, Size2D } from './imageDetailLayoutViewModel';

const IMAGE_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const MASK_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

afterEach(() => {
  cleanup();
});

describe('ImageDetailModalFrames', () => {
  it('renders the touch frame and wires mobile navigation controls', () => {
    const onNext = vi.fn();
    const image = buildImage({ imageId: 7, name: 'touch-main.jpg' });
    const camera = buildCamera();
    const containerSize = buildContainerSize();

    render(
      <TouchImageDetailFrame
        camera={camera}
        closeImageDetail={vi.fn()}
        connectedImages={[]}
        containerSize={containerSize}
        currentIndex={0}
        effectivePoints2D={[]}
        handleTouchEnd={vi.fn()}
        handleTouchMove={vi.fn()}
        handleTouchStart={vi.fn()}
        hasNext
        hasPrev={false}
        image={image}
        imageContainerRef={createRef<HTMLDivElement>()}
        imageIds={[7, 8]}
        imageSrc={IMAGE_SRC}
        isMarkedForDeletion={false}
        isMatchViewMode={false}
        matchLineOpacity={0.7}
        matchLines={[]}
        matchedCamera={null}
        matchedImage={null}
        matchedImageId={null}
        matchedImageSrc={null}
        numPoints2D={2}
        numPoints3D={1}
        setMatchedImageId={vi.fn()}
        setMatchLineOpacity={vi.fn()}
        setShowMatchesInModal={vi.fn()}
        setShowPoints2D={vi.fn()}
        setShowPoints3D={vi.fn()}
        showMatchesInModal={false}
        showModalControls
        showPoints2D={false}
        showPoints3D={false}
        singleImageLayout={buildSingleImageLayout()}
        verticalStackedLayout={buildMatchViewLayout()}
        onNext={onNext}
        onPrev={vi.fn()}
      />
    );

    expect(screen.getByText('touch-main.jpg')).toBeVisible();
    expect(screen.getByRole('img', { name: 'touch-main.jpg' })).toBeVisible();
    expect(screen.getByText('1 / 2')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('renders the desktop frame and keeps modal chrome actions wired', () => {
    const closeImageDetail = vi.fn();
    const handleResizeStart = vi.fn<ComponentProps<typeof DesktopImageDetailFrame>['handleResizeStart']>();
    const cycleMaskMode = vi.fn();
    const onOpenImageId = vi.fn();
    const setShowMatchesInModal = vi.fn();
    const image = buildImage({ imageId: 7, name: 'desktop-main.jpg' });
    const matchedImage = buildImage({ imageId: 8, name: 'desktop-match.jpg' });
    const camera = buildCamera();
    const matchedCamera = buildCamera({ cameraId: 2 });
    const containerSize = buildContainerSize();

    render(
      <DesktopImageDetailFrame
        camera={camera}
        cameraAllMarked={false}
        closeImageDetail={closeImageDetail}
        connectedImages={[{ imageId: 8, matchCount: 3, name: 'desktop-match.jpg' }]}
        containerSize={containerSize}
        currentMatchCount={0}
        cycleMaskMode={cycleMaskMode}
        effectivePoints2D={[]}
        frameAllMarked={false}
        frameImageIds={[7, 8]}
        handleDeleteToggle={vi.fn()}
        handleDragStart={vi.fn()}
        handleMaskMouseLeave={vi.fn()}
        handleMaskMouseMove={vi.fn()}
        handleMatchedImageWheel={vi.fn()}
        handleOpacityDoubleClick={vi.fn()}
        handleOpacityKeyDown={vi.fn()}
        handleOpacityWheel={vi.fn()}
        handleResizeStart={handleResizeStart}
        handleToggleCamera={vi.fn()}
        handleToggleFrame={vi.fn()}
        hasMask
        hasNext
        hasPrev
        image={image}
        imageContainerRef={createRef<HTMLDivElement>()}
        imageCount={2}
        imageDetailId={7}
        imageExists={() => true}
        imageSrc={IMAGE_SRC}
        isEditingOpacity={false}
        isMarkedForDeletion={false}
        isMatchViewMode={false}
        maskMode="hover"
        maskSrc={MASK_SRC}
        matchLineOpacity={0.5}
        matchLines={[]}
        matchedCamera={matchedCamera}
        matchedImage={matchedImage}
        matchedImageId={8}
        matchedImageSrc={IMAGE_SRC}
        multiCamera
        numPoints2D={3}
        numPoints3D={2}
        opacityInputRef={createRef<HTMLInputElement>()}
        opacityInputValue="50"
        position={{ x: 20, y: 30 }}
        setMatchedImageId={vi.fn()}
        setMatchLineOpacity={vi.fn()}
        setOpacityInputValue={vi.fn()}
        setShowMatchesInModal={setShowMatchesInModal}
        setShowPoints2D={vi.fn()}
        setShowPoints3D={vi.fn()}
        showMatchesInModal={false}
        showPoints2D={false}
        showPoints3D={false}
        sideBySideLayout={buildMatchViewLayout()}
        singleImageLayout={buildSingleImageLayout()}
        size={{ width: 640, height: 480 }}
        splitX={0.5}
        onNext={vi.fn()}
        onOpenImageId={onOpenImageId}
        onOpacityBlur={vi.fn()}
        onPrev={vi.fn()}
      />
    );

    expect(screen.getByText('Image #7: desktop-main.jpg')).toBeVisible();
    expect(screen.getByText('Image #7: desktop-main.jpg').closest('.absolute')).toHaveStyle({
      left: '20px',
      top: '30px',
      width: '640px',
      height: '480px',
    });
    expect(screen.getByText(/Scroll: iterate through images/)).toBeVisible();
    expect(screen.getByText(/Click:/)).toBeVisible();
    expect(screen.getByRole('img', { name: 'desktop-main.jpg' })).toBeVisible();

    fireEvent.click(screen.getByRole('img', { name: 'desktop-main.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show Matches' }));
    fireEvent.pointerDown(screen.getByLabelText('Resize se'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '8' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    fireEvent.click(screen.getByTitle('Close'));

    expect(cycleMaskMode).toHaveBeenCalledOnce();
    expect(setShowMatchesInModal).toHaveBeenCalledWith(true);
    expect(handleResizeStart.mock.calls[0]?.[1]).toBe('se');
    expect(onOpenImageId).toHaveBeenCalledWith(8);
    expect(closeImageDetail).toHaveBeenCalledOnce();
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
    offsetX: 0,
    offsetY: 0,
    scaleX: 0.5,
    scaleY: 0.5,
  };
}

function buildMatchViewLayout(): MatchViewLayout {
  return {
    image1: {
      width: 300,
      height: 220,
      offsetX: 0,
      offsetY: 0,
      scaleX: 0.5,
      scaleY: 0.5,
    },
    image2: {
      width: 300,
      height: 220,
      offsetX: 320,
      offsetY: 0,
      scaleX: 0.5,
      scaleY: 0.5,
    },
  };
}
