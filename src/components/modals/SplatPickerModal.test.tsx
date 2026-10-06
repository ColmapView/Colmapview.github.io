import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReconstructionStore } from '../../store/reconstructionStore';
import { useSplatBackendStore } from '../../store/stores/splatBackendStore';
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

describe('SplatPickerModal COLMAP-only selection', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    mockUseIsTouchDevice.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    useReconstructionStore.getState().clear();
    vi.unstubAllGlobals();
  });

  it.each(['None', 'Skip', 'Escape', 'backdrop'])('%s cancels a pending HF PLY without replacing COLMAP data', async choice => {
    let resolveDownload!: (response: Response) => void;
    let downloadSignal: AbortSignal | null | undefined;
    const request = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>(resolve => {
      downloadSignal = init?.signal;
      resolveDownload = resolve;
    }));
    vi.stubGlobal('fetch', request);
    const camerasFile = new File(['cameras'], 'cameras.bin');
    const imagesFile = new File(['images'], 'images.bin');
    const points3DFile = new File(['points'], 'points3D.bin');
    useReconstructionStore.setState({
      showSplatPicker: true,
      loadedFiles: {
        camerasFile, imagesFile, points3DFile, imageFiles: new Map(), hasMasks: false,
        splatFileSources: [{ id: 'mid', path: 'scene.ply',
          url: 'https://huggingface.co/datasets/owner/scene/resolve/main/scene.ply', size: 91_000_000 }],
      },
    });
    render(<SplatPickerModal />);
    let pending!: Promise<void>;
    act(() => { pending = useReconstructionStore.getState().selectSplatSource('mid'); });
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(downloadSignal?.aborted).toBe(false);

    if (choice === 'None') fireEvent.click(screen.getByRole('button', { name: 'None - COLMAP only' }));
    else if (choice === 'Skip') fireEvent.click(screen.getByRole('button', { name: 'Skip (COLMAP only)' }));
    else if (choice === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
    else fireEvent.click(screen.getByRole('dialog'));

    expect(downloadSignal?.aborted).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useReconstructionStore.getState().urlLoading).toBe(false);
    expect(useReconstructionStore.getState().urlProgress).toBeNull();
    // A provider response arriving after cancellation must not reactivate the tile.
    await act(async () => {
      resolveDownload(new Response(new Uint8Array([1, 2, 3])));
      await pending;
    });
    const state = useReconstructionStore.getState();
    expect(state.loadedFiles).toMatchObject({ camerasFile, imagesFile, points3DFile });
    expect(state.loadedFiles?.splatFile).toBeUndefined();
    expect(state.requestedSplatSourceId).toBeNull();
    expect(state.urlError).toBeNull();
    expect(state.urlLoading).toBe(false);
    expect(request).toHaveBeenCalledOnce();
  });
});

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

  it('lets a phone pick a mid-size SOG, warning that it may exceed the splat limit', () => {
    const selectSplatSource = vi.fn();
    mockUseIsTouchDevice.mockReturnValue(true);
    // 40 MB SOG: ~4M splats by the 10 B/splat estimate, but within the 50 MB touch budget.
    useReconstructionStore.setState({
      showSplatPicker: true,
      loadedFiles: {
        imageFiles: new Map(),
        hasMasks: false,
        splatFileSources: [{ id: 'mid-sog', path: 'splats/scene.sog', url: 'u', size: 40_000_000 }],
      },
      selectSplatSource,
    });

    render(<SplatPickerModal />);

    const row = screen.getByText('scene.sog').closest('button');
    expect(row).not.toBeDisabled();
    expect(screen.getByText("may exceed this device's splat limit")).toBeInTheDocument();
    fireEvent.click(row!);
    expect(selectSplatSource).toHaveBeenCalledWith('mid-sog');
  });
});

// 364 MB PLY with an explicit 3.5M splat count: over the retaining 3M ceiling,
// within the byte-less 4M ceiling. The row's tier therefore depends on whether
// the byte-less WebGPU loader is available on this device.
function openPickerWithByteLessEligibleSplat() {
  useReconstructionStore.setState({
    showSplatPicker: true,
    loadedFiles: {
      imageFiles: new Map(),
      hasMasks: false,
      splatFileSources: [
        { id: 'big', path: 'splats/big.ply', url: 'u', size: 364_000_000, splatCount: 3_500_000 },
      ],
    },
  });
}

describe('SplatPickerModal byte-less ceiling', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    mockUseIsTouchDevice.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it('offers a 3-4M splat with a memory hint on touch when the WebGPU byte-less loader is available', () => {
    mockUseIsTouchDevice.mockReturnValue(true);
    useSplatBackendStore.setState({
      requestedBackend: 'auto',
      availability: { webGpu: 'ready', webGpuFailureReason: null, spark: false },
    });
    openPickerWithByteLessEligibleSplat();

    render(<SplatPickerModal />);

    const row = screen.getByText('big.ply').closest('button');
    expect(row).not.toBeNull();
    expect(row).not.toBeDisabled();
    expect(screen.getByText(MEMORY_WARNING)).toBeInTheDocument();
  });

  it('keeps the 3M ceiling (disabled row) on Spark-bound touch devices', () => {
    mockUseIsTouchDevice.mockReturnValue(true);
    // jsdom has no navigator.gpu, so the initial backend state is
    // webGpu 'unsupported' -> resolves to the Spark fallback -> no byte-less.
    openPickerWithByteLessEligibleSplat();

    render(<SplatPickerModal />);

    expect(screen.getByText('big.ply').closest('button')).toBeDisabled();
  });

  it('keeps the 3M ceiling (disabled row) when Spark is loaded while WebGPU initializes', () => {
    // Codex-gate P1 at the picker layer: auto mode, WebGPU still 'unavailable'
    // (initializing) but the Spark module already loaded -> resolveSplatBackend
    // picks Spark -> byte-less off -> the conservative 3M ceiling disables the row.
    mockUseIsTouchDevice.mockReturnValue(true);
    useSplatBackendStore.setState({
      requestedBackend: 'auto',
      availability: { webGpu: 'unavailable', webGpuFailureReason: null, spark: true },
    });
    openPickerWithByteLessEligibleSplat();

    render(<SplatPickerModal />);

    expect(screen.getByText('big.ply').closest('button')).toBeDisabled();
  });

  it('offers the 3-4M splat (raised 4M ceiling) on a fresh load while WebGPU initializes and Spark is not loaded', () => {
    // Companion invariant: same 'unavailable' state, Spark NOT loaded -> byte-less
    // stays on -> raised 4M ceiling -> the 3.5M row is offered with a memory hint.
    mockUseIsTouchDevice.mockReturnValue(true);
    useSplatBackendStore.setState({
      requestedBackend: 'auto',
      availability: { webGpu: 'unavailable', webGpuFailureReason: null, spark: false },
    });
    openPickerWithByteLessEligibleSplat();

    render(<SplatPickerModal />);

    const row = screen.getByText('big.ply').closest('button');
    expect(row).not.toBeDisabled();
    expect(screen.getByText(MEMORY_WARNING)).toBeInTheDocument();
  });
});
