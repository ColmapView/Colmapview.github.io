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
  it('loads open tool modals and passes their close handlers', async () => {
    const setShowFloorModal = vi.fn();
    const setShowDeletionModal = vi.fn();
    const setShowConversionModal = vi.fn();
    const setShowAutoHideEditor = vi.fn();

    render(
      <ViewerToolModals
        showFloorModal={true}
        setShowFloorModal={setShowFloorModal}
        showDeletionModal={true}
        setShowDeletionModal={setShowDeletionModal}
        showConversionModal={true}
        setShowConversionModal={setShowConversionModal}
        showAutoHideEditor={true}
        setShowAutoHideEditor={setShowAutoHideEditor}
      />
    );

    expect(await screen.findByTestId('floor-modal')).toHaveAttribute('data-open', 'true');
    expect(await screen.findByTestId('deletion-modal')).toHaveAttribute('data-open', 'true');
    expect(await screen.findByTestId('conversion-modal')).toHaveAttribute('data-open', 'true');
    expect(await screen.findByTestId('auto-hide-modal')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByTestId('floor-modal'));
    fireEvent.click(screen.getByTestId('deletion-modal'));
    fireEvent.click(screen.getByTestId('conversion-modal'));
    fireEvent.click(screen.getByTestId('auto-hide-modal'));

    expect(setShowFloorModal).toHaveBeenCalledWith(false);
    expect(setShowDeletionModal).toHaveBeenCalledWith(false);
    expect(setShowConversionModal).toHaveBeenCalledWith(false);
    expect(setShowAutoHideEditor).toHaveBeenCalledWith(false);
  });

  it('does not mount tools that have never opened', () => {
    render(<ViewerToolModals showFloorModal={false} setShowFloorModal={vi.fn()}
      showDeletionModal={false} setShowDeletionModal={vi.fn()}
      showConversionModal={false} setShowConversionModal={vi.fn()}
      showAutoHideEditor={false} setShowAutoHideEditor={vi.fn()} />);
    expect(screen.queryByTestId('floor-modal')).toBeNull();
    expect(screen.queryByTestId('deletion-modal')).toBeNull();
    expect(screen.queryByTestId('conversion-modal')).toBeNull();
    expect(screen.queryByTestId('auto-hide-modal')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
