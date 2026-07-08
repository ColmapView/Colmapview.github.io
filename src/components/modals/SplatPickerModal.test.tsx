import { cleanup, render, screen } from '@testing-library/react';
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

function openPickerWithHugeSplat() {
  useReconstructionStore.setState({
    showSplatPicker: true,
    loadedFiles: {
      imageFiles: new Map(),
      hasMasks: false,
      // ~1 GB, far above the 50 MB touch auto-load budget.
      splatFileSources: [{ id: 'huge', path: 'splats/huge.ply', url: 'u', size: 1_040_000_634 }],
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
    openPickerWithHugeSplat();

    render(<SplatPickerModal />);

    expect(screen.getByText(MEMORY_WARNING)).toBeInTheDocument();
  });

  it('does not warn on non-touch hardware even when UI touch mode is on (phone-width desktop)', () => {
    mockUseIsTouchDevice.mockReturnValue(false);
    useUIStore.setState({ touchMode: true });
    openPickerWithHugeSplat();

    render(<SplatPickerModal />);

    expect(screen.queryByText(MEMORY_WARNING)).not.toBeInTheDocument();
  });
});
