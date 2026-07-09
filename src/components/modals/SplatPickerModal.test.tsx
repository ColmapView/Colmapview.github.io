import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReconstructionStore } from '../../store/reconstructionStore';
import { useUIStore } from '../../store/stores/uiStore';
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice';
import { SplatPickerModal } from './SplatPickerModal';

// The device-memory hint must key on the hardware touch signal (detectTouchDevice,
// which drives the auto-load budget), NOT the UI touchMode flag. Post-T9 a
// phone-width desktop window is touchMode=true but keeps the 150MB desktop budget.
vi.mock('../../hooks/useIsTouchDevice', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useIsTouchDevice')>();
  return { ...actual, useIsTouchDevice: vi.fn(() => false) };
});

const mockUseIsTouchDevice = vi.mocked(useIsTouchDevice);
const MEMORY_WARNING = "may exceed this device's memory";

// ~91 MB PLY: over the 50 MB touch auto-load budget but well under the 3M-splat
// disable threshold, so on touch hardware this is the HINT tier (not disabled).
function openPickerWithOverBudgetSplat() {
  useReconstructionStore.setState({
    showSplatPicker: true,
    loadedFiles: {
      imageFiles: new Map(),
      hasMasks: false,
      splatFileSources: [{ id: 'mid', path: 'splats/mid.ply', url: 'u', size: 91_000_000 }],
    },
  });
}

// ~1 GB PLY carrying an explicit 10M splat count: over the 3M disable threshold,
// so on touch hardware the row is DISABLED (tapping it would crash the tab).
function openPickerWithDisabledSplat() {
  useReconstructionStore.setState({
    showSplatPicker: true,
    loadedFiles: {
      imageFiles: new Map(),
      hasMasks: false,
      splatFileSources: [
        { id: 'huge', path: 'splats/huge.ply', url: 'u', size: 1_040_000_634, splatCount: 10_000_000 },
      ],
    },
  });
}

describe('SplatPickerModal device-memory hint', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    mockUseIsTouchDevice.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it('warns when the hardware is a touch device even if UI touch mode is off', () => {
    mockUseIsTouchDevice.mockReturnValue(true);
    useUIStore.setState({ touchMode: false });
    openPickerWithOverBudgetSplat();

    render(<SplatPickerModal />);

    expect(screen.getByText(MEMORY_WARNING)).toBeInTheDocument();
  });

  it('does not warn on non-touch hardware even when UI touch mode is on (phone-width desktop)', () => {
    mockUseIsTouchDevice.mockReturnValue(false);
    useUIStore.setState({ touchMode: true });
    openPickerWithOverBudgetSplat();

    render(<SplatPickerModal />);

    expect(screen.queryByText(MEMORY_WARNING)).not.toBeInTheDocument();
  });
});

describe('SplatPickerModal disabled tier', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    mockUseIsTouchDevice.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it('disables the row and blocks selection for a device-exceeding splat on touch', () => {
    const selectSplatSource = vi.fn();
    mockUseIsTouchDevice.mockReturnValue(true);
    openPickerWithDisabledSplat();
    useReconstructionStore.setState({ selectSplatSource });

    render(<SplatPickerModal />);

    const row = screen.getByText('huge.ply').closest('button');
    expect(row).not.toBeNull();
    expect(row).toBeDisabled();
    expect(
      screen.getByText('Too large for this device (1.0 GB) - open on a desktop to view')
    ).toBeInTheDocument();

    fireEvent.click(row!);
    expect(selectSplatSource).not.toHaveBeenCalled();
  });
});
