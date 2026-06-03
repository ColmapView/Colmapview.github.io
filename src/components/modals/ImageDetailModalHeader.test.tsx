import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCamera, buildImage } from '../../test/builders';
import { TOUCH, modalStyles } from '../../theme';
import {
  DesktopImageDetailHeader,
  TouchImageDetailHeader,
} from './ImageDetailModalHeader';
import {
  getCameraDeletionTitle,
  getDeleteScopeButtonClassName,
  getDesktopImageDetailTitle,
  getDesktopHeaderCloseButtonState,
  getDesktopHeaderDragStyle,
  getFrameDeletionTitle,
  getImageDetailHeaderTitleClassName,
  getImageDeletionTitle,
  getTouchHeaderCloseButtonState,
  getTouchImageDetailTitle,
} from './imageDetailModalHeaderViewModel';

afterEach(() => {
  cleanup();
});

describe('image detail modal headers', () => {
  it('derives touch and desktop titles without duplicating frame JSX policy', () => {
    expect(getTouchImageDetailTitle({
      imageName: 'left.jpg',
      matchedImageName: 'right.jpg',
      isMatchViewMode: true,
    })).toBe('left.jpg ↔ right.jpg');
    expect(getTouchImageDetailTitle({
      imageName: 'left.jpg',
      matchedImageName: undefined,
      isMatchViewMode: false,
    })).toBe('left.jpg');

    expect(getDesktopImageDetailTitle({
      imageName: 'left.jpg',
      matchedImageName: 'right.jpg',
      isMatchViewMode: true,
      imageDetailId: 7,
      currentMatchCount: 12,
    })).toBe('Image Matches: left.jpg ↔ right.jpg (12 matches)');
    expect(getDesktopImageDetailTitle({
      imageName: 'left.jpg',
      matchedImageName: undefined,
      isMatchViewMode: false,
      imageDetailId: 7,
      currentMatchCount: 0,
    })).toBe('Image #7: left.jpg');
  });

  it('derives restore/delete button titles for each deletion scope', () => {
    expect(getImageDeletionTitle(false)).toBe('Delete image from model');
    expect(getImageDeletionTitle(true)).toBe('Restore image');
    expect(getCameraDeletionTitle(false, 4)).toBe('Delete camera 4');
    expect(getCameraDeletionTitle(true, 4)).toBe('Restore camera 4');
    expect(getFrameDeletionTitle(false)).toBe('Delete frame');
    expect(getFrameDeletionTitle(true)).toBe('Restore frame');
  });

  it('derives title, delete button, close button, and drag render state', () => {
    expect(getImageDetailHeaderTitleClassName({
      variant: 'touch',
      isMarkedForDeletion: false,
    })).toBe('text-ds-primary text-sm truncate flex-1 mr-2');
    expect(getImageDetailHeaderTitleClassName({
      variant: 'desktop',
      isMarkedForDeletion: true,
    })).toBe('text-ds-primary line-through text-ds-error');

    expect(getDeleteScopeButtonClassName(false)).toBe(
      `${modalStyles.headerIconButton} text-ds-muted hover:text-ds-error hover:bg-ds-error/20`
    );
    expect(getDeleteScopeButtonClassName(true)).toBe(
      `${modalStyles.headerIconButton} text-ds-success hover:bg-ds-success/20`
    );

    expect(getTouchHeaderCloseButtonState()).toEqual({
      className: 'w-10 h-10 flex items-center justify-center text-ds-muted hover:text-ds-primary text-2xl',
      style: { minWidth: TOUCH.minTapTarget, minHeight: TOUCH.minTapTarget },
      title: 'Close',
    });
    expect(getDesktopHeaderCloseButtonState()).toEqual({
      className: modalStyles.toolHeaderClose,
      title: 'Close',
    });
    expect(getDesktopHeaderDragStyle()).toEqual({ touchAction: 'none' });
  });

  it('renders touch title, pose metadata, and close action', () => {
    const closeImageDetail = vi.fn();
    const image = buildImage({ name: 'touch.jpg' });

    render(
      <TouchImageDetailHeader
        camera={buildCamera()}
        closeImageDetail={closeImageDetail}
        image={image}
        isMarkedForDeletion={false}
        isMatchViewMode={false}
        matchedImage={null}
      />
    );

    expect(screen.getByText('touch.jpg')).toBeVisible();
    expect(screen.getByText('OpenCV K')).toHaveAttribute('title', 'PINHOLE');

    const closeButton = screen.getByTitle('Close');
    expect(closeButton).toHaveStyle({
      minWidth: `${TOUCH.minTapTarget}px`,
      minHeight: `${TOUCH.minTapTarget}px`,
    });

    fireEvent.click(closeButton);
    expect(closeImageDetail).toHaveBeenCalledOnce();
  });

  it('renders desktop header actions and keeps action pointerdown from starting drag', () => {
    const closeImageDetail = vi.fn();
    const handleDeleteToggle = vi.fn();
    const handleToggleCamera = vi.fn();
    const handleToggleFrame = vi.fn();
    const handleDragStart = vi.fn();
    const image = buildImage({ imageId: 7, cameraId: 4, name: 'left.jpg' });
    const matchedImage = buildImage({ imageId: 8, name: 'right.jpg' });

    render(
      <DesktopImageDetailHeader
        cameraAllMarked={false}
        closeImageDetail={closeImageDetail}
        currentMatchCount={12}
        frameAllMarked={true}
        frameImageIds={[7, 8]}
        handleDeleteToggle={handleDeleteToggle}
        handleDragStart={handleDragStart}
        handleToggleCamera={handleToggleCamera}
        handleToggleFrame={handleToggleFrame}
        image={image}
        imageDetailId={7}
        isMarkedForDeletion={false}
        isMatchViewMode={true}
        matchedImage={matchedImage}
        multiCamera
      />
    );

    expect(screen.getByText('Image Matches: left.jpg ↔ right.jpg (12 matches)')).toBeVisible();

    fireEvent.pointerDown(screen.getByTitle('Delete image from model'));
    fireEvent.click(screen.getByTitle('Delete image from model'));
    fireEvent.click(screen.getByTitle('Delete camera 4'));
    fireEvent.click(screen.getByTitle('Restore frame'));
    fireEvent.click(screen.getByTitle('Close'));

    expect(handleDragStart).not.toHaveBeenCalled();
    expect(handleDeleteToggle).toHaveBeenCalledOnce();
    expect(handleToggleCamera).toHaveBeenCalledOnce();
    expect(handleToggleFrame).toHaveBeenCalledOnce();
    expect(closeImageDetail).toHaveBeenCalledOnce();
  });
});
