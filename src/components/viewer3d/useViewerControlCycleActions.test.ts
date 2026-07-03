import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  applyAxesGridState,
  applyVisibleModeState,
  useViewerControlCycleActions,
} from './useViewerControlCycleActions';

function createOptions(overrides: Partial<Parameters<typeof useViewerControlCycleActions>[0]> = {}) {
  return {
    backgroundHsl: { h: 0, s: 0, l: 20 },
    setBackgroundHsl: vi.fn(),
    cameraMode: 'orbit' as const,
    setCameraMode: vi.fn(),
    horizonLock: 'off' as const,
    setHorizonLock: vi.fn(),
    autoRotateMode: 'off' as const,
    setAutoRotateMode: vi.fn(),
    undistortionEnabled: true,
    setUndistortionEnabled: vi.fn(),
    showPointCloud: false,
    colorMode: 'trackLength' as const,
    hasSplatData: true,
    setShowPointCloud: vi.fn(),
    setColorMode: vi.fn(),
    showCameras: true,
    cameraDisplayMode: 'frustum' as const,
    hasPinholeCameras: true,
    setShowCameras: vi.fn(),
    setCameraDisplayMode: vi.fn(),
    showMatches: true,
    matchesDisplayMode: 'static' as const,
    setShowMatches: vi.fn(),
    setMatchesDisplayMode: vi.fn(),
    showSelectionHighlight: true,
    selectionColorMode: 'blink' as const,
    setShowSelectionHighlight: vi.fn(),
    setSelectionColorMode: vi.fn(),
    showRig: true,
    rigDisplayMode: 'static' as const,
    setShowRig: vi.fn(),
    setRigDisplayMode: vi.fn(),
    setView: vi.fn(),
    setCameraProjection: vi.fn(),
    showAxes: true,
    showGrid: true,
    setShowAxes: vi.fn(),
    setShowGrid: vi.fn(),
    ...overrides,
  };
}

describe('viewer control cycle actions', () => {
  it('applies visible/mode state changes without redundant setter calls', () => {
    const setVisible = vi.fn();
    const setMode = vi.fn();

    applyVisibleModeState({
      current: { visible: true, mode: 'rgb' },
      next: { visible: true, mode: 'error' },
      setVisible,
      setMode,
    });

    expect(setVisible).not.toHaveBeenCalled();
    expect(setMode).toHaveBeenCalledWith('error');
  });

  it('applies axes/grid state changes without redundant setter calls', () => {
    const setShowAxes = vi.fn();
    const setShowGrid = vi.fn();

    applyAxesGridState({
      current: { showAxes: true, showGrid: true },
      next: { showAxes: true, showGrid: false },
      setShowAxes,
      setShowGrid,
    });

    expect(setShowAxes).not.toHaveBeenCalled();
    expect(setShowGrid).toHaveBeenCalledWith(false);
  });

  it('returns callbacks for common toolbar cycles and toggles', () => {
    const options = createOptions();
    const { result } = renderHook(() => useViewerControlCycleActions(options));

    act(() => result.current.toggleBackground());
    expect(options.setBackgroundHsl).toHaveBeenCalledWith({ h: 0, s: 0, l: 100 });

    act(() => result.current.toggleCameraMode());
    expect(options.setCameraMode).toHaveBeenCalledWith('fly');

    act(() => result.current.cycleHorizonLock());
    expect(options.setHorizonLock).toHaveBeenCalledWith('on');

    act(() => result.current.cycleAutoRotate());
    expect(options.setAutoRotateMode).toHaveBeenCalledWith('cw');

    act(() => result.current.toggleUndistortion());
    expect(options.setUndistortionEnabled).toHaveBeenCalledWith(false);

    act(() => result.current.cycleColorMode());
    expect(options.setShowPointCloud).toHaveBeenCalledWith(true);
    expect(options.setColorMode).toHaveBeenCalledWith('rgb');

    act(() => result.current.handleResetView());
    expect(options.setView).toHaveBeenCalledWith('reset');
    expect(options.setCameraProjection).toHaveBeenCalledWith('perspective');

    act(() => result.current.cycleAxesGrid());
    expect(options.setShowAxes).not.toHaveBeenCalled();
    expect(options.setShowGrid).toHaveBeenCalledWith(false);
  });

  it('cycles camera, matches, selection, and rig display state', () => {
    const options = createOptions();
    const { result } = renderHook(() => useViewerControlCycleActions(options));

    act(() => result.current.cycleCameraDisplayMode());
    expect(options.setShowCameras).not.toHaveBeenCalled();
    expect(options.setCameraDisplayMode).toHaveBeenCalledWith('arrow');

    act(() => result.current.cycleMatchesDisplayMode());
    expect(options.setShowMatches).not.toHaveBeenCalled();
    expect(options.setMatchesDisplayMode).toHaveBeenCalledWith('blink');

    act(() => result.current.cycleSelectionColorMode());
    expect(options.setShowSelectionHighlight).not.toHaveBeenCalled();
    expect(options.setSelectionColorMode).toHaveBeenCalledWith('rainbow');

    act(() => result.current.cycleRigDisplayMode());
    expect(options.setShowRig).not.toHaveBeenCalled();
    expect(options.setRigDisplayMode).toHaveBeenCalledWith('blink');
  });

  it('toggles only camera visibility when cycling display without pinhole cameras', () => {
    // From visible: cycling hides the cameras and preserves the mode (no cycle to 'arrow').
    const visibleOptions = createOptions({
      showCameras: true,
      cameraDisplayMode: 'frustum',
      hasPinholeCameras: false,
    });
    const { result: visibleResult } = renderHook(() => useViewerControlCycleActions(visibleOptions));
    act(() => visibleResult.current.cycleCameraDisplayMode());
    expect(visibleOptions.setShowCameras).toHaveBeenCalledWith(false);
    expect(visibleOptions.setCameraDisplayMode).not.toHaveBeenCalled();

    // From hidden: cycling shows the cameras and preserves a persisted 'imageplane' mode
    // (instead of resetting it to the default 'frustum').
    const hiddenOptions = createOptions({
      showCameras: false,
      cameraDisplayMode: 'imageplane',
      hasPinholeCameras: false,
    });
    const { result: hiddenResult } = renderHook(() => useViewerControlCycleActions(hiddenOptions));
    act(() => hiddenResult.current.cycleCameraDisplayMode());
    expect(hiddenOptions.setShowCameras).toHaveBeenCalledWith(true);
    expect(hiddenOptions.setCameraDisplayMode).not.toHaveBeenCalled();
  });

  it('skips splat color modes when cycling point color without splat data', () => {
    const options = createOptions({
      showPointCloud: true,
      colorMode: 'trackLength',
      hasSplatData: false,
    });
    const { result } = renderHook(() => useViewerControlCycleActions(options));

    act(() => result.current.cycleColorMode());
    expect(options.setShowPointCloud).not.toHaveBeenCalled();
    expect(options.setColorMode).toHaveBeenCalledWith('rgb');
  });
});
