import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopImageControls, TouchImageControls } from './ImageDetailControls';

afterEach(() => {
  cleanup();
});

describe('ImageDetailControls', () => {
  it('renders touch point toggles from descriptors and routes visibility updates', () => {
    const setShowPoints2D = vi.fn();
    const setShowPoints3D = vi.fn();

    render(
      <TouchImageControls
        {...buildSharedControlProps()}
        setShowPoints2D={setShowPoints2D}
        setShowPoints3D={setShowPoints3D}
        hasPrev={false}
        hasNext
        currentIndex={0}
        imageCount={2}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /2d/i }));
    fireEvent.click(screen.getByRole('button', { name: /3d/i }));

    expect(setShowPoints2D).toHaveBeenCalledWith(true);
    expect(setShowPoints3D).toHaveBeenCalledWith(true);
  });

  it('renders touch match controls and reports opacity updates', () => {
    const setMatchLineOpacity = vi.fn();

    render(
      <TouchImageControls
        {...buildSharedControlProps()}
        showMatchesInModal
        matchedImageId={8}
        matchLineOpacity={0.7}
        setMatchLineOpacity={setMatchLineOpacity}
        hasPrev
        hasNext
        currentIndex={0}
        imageCount={2}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /2d/i })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('8');
    expect(screen.getByText('70%')).toBeVisible();

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0.4' } });
    expect(setMatchLineOpacity).toHaveBeenCalledWith(0.4);
  });

  it('renders desktop match controls and keeps select, opacity, and navigation wired', () => {
    const setMatchedImageId = vi.fn();
    const setMatchLineOpacity = vi.fn();
    const onOpacityDoubleClick = vi.fn();
    const onNext = vi.fn();

    render(
      <DesktopImageControls
        {...buildSharedControlProps()}
        showMatchesInModal
        matchedImageId={8}
        matchLineOpacity={0.5}
        setMatchedImageId={setMatchedImageId}
        setMatchLineOpacity={setMatchLineOpacity}
        hasPrev={false}
        hasNext
        imageDetailId={7}
        imageCount={3}
        isEditingOpacity={false}
        opacityInputRef={createRef<HTMLInputElement>()}
        opacityInputValue="50"
        setOpacityInputValue={vi.fn()}
        onPrev={vi.fn()}
        onNext={onNext}
        onMatchedImageWheel={vi.fn()}
        onOpacityWheel={vi.fn()}
        onOpacityDoubleClick={onOpacityDoubleClick}
        onOpacityBlur={vi.fn()}
        onOpacityKeyDown={vi.fn()}
        onOpenImageId={vi.fn()}
        imageExists={() => true}
      />
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '9' } });
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0.25' } });
    fireEvent.doubleClick(screen.getByTitle('Double-click to edit'));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(setMatchedImageId).toHaveBeenCalledWith(9);
    expect(setMatchLineOpacity).toHaveBeenCalledWith(0.25);
    expect(onOpacityDoubleClick).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
  });
});

function buildSharedControlProps() {
  return {
    isMarkedForDeletion: false,
    showPoints2D: false,
    showPoints3D: false,
    showMatchesInModal: false,
    matchedImageId: null,
    connectedImages: [
      { imageId: 8, matchCount: 4, name: 'match-a.jpg' },
      { imageId: 9, matchCount: 2, name: 'match-b.jpg' },
    ],
    numPoints2D: 5,
    numPoints3D: 3,
    matchLineOpacity: 0.5,
    setShowPoints2D: vi.fn(),
    setShowPoints3D: vi.fn(),
    setShowMatchesInModal: vi.fn(),
    setMatchedImageId: vi.fn(),
    setMatchLineOpacity: vi.fn(),
  };
}
