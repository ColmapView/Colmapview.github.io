import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ViewerToolModals } from './ViewerToolModals';

interface MockModalProps {
  isOpen: boolean;
  onClose: () => void;
}

vi.mock('../modals/FloorDetectionModal', () => ({
  FloorDetectionModal: ({ isOpen, onClose }: MockModalProps) => (
    <button data-testid="floor-modal" data-open={String(isOpen)} onClick={onClose}>
      floor
    </button>
  ),
}));

vi.mock('../modals/DeletionModal', () => ({
  DeletionModal: ({ isOpen, onClose }: MockModalProps) => (
    <button data-testid="deletion-modal" data-open={String(isOpen)} onClick={onClose}>
      deletion
    </button>
  ),
}));

vi.mock('../modals/CameraConversionModal', () => ({
  CameraConversionModal: ({ isOpen, onClose }: MockModalProps) => (
    <button data-testid="conversion-modal" data-open={String(isOpen)} onClick={onClose}>
      conversion
    </button>
  ),
}));

vi.mock('../modals/AutoHideModal', () => ({
  AutoHideModal: ({ isOpen, onClose }: MockModalProps) => (
    <button data-testid="auto-hide-modal" data-open={String(isOpen)} onClick={onClose}>
      auto-hide
    </button>
  ),
}));

describe('ViewerToolModals', () => {
  it('passes open state and close handlers to each tool modal', () => {
    const setShowFloorModal = vi.fn();
    const setShowDeletionModal = vi.fn();
    const setShowConversionModal = vi.fn();
    const setShowAutoHideEditor = vi.fn();

    render(
      <ViewerToolModals
        showFloorModal={true}
        setShowFloorModal={setShowFloorModal}
        showDeletionModal={false}
        setShowDeletionModal={setShowDeletionModal}
        showConversionModal={true}
        setShowConversionModal={setShowConversionModal}
        showAutoHideEditor={false}
        setShowAutoHideEditor={setShowAutoHideEditor}
      />
    );

    expect(screen.getByTestId('floor-modal')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('deletion-modal')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('conversion-modal')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('auto-hide-modal')).toHaveAttribute('data-open', 'false');

    fireEvent.click(screen.getByTestId('floor-modal'));
    fireEvent.click(screen.getByTestId('deletion-modal'));
    fireEvent.click(screen.getByTestId('conversion-modal'));
    fireEvent.click(screen.getByTestId('auto-hide-modal'));

    expect(setShowFloorModal).toHaveBeenCalledWith(false);
    expect(setShowDeletionModal).toHaveBeenCalledWith(false);
    expect(setShowConversionModal).toHaveBeenCalledWith(false);
    expect(setShowAutoHideEditor).toHaveBeenCalledWith(false);
  });
});
