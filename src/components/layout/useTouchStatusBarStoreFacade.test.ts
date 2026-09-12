import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store/reconstructionStore';
import { useUIStore } from '../../store/stores/uiStore';
import { useTrainingStore } from '../../store/stores/trainingStore';
import { buildReconstruction } from '../../test/builders/colmapBuilders';
import { useTouchStatusBarStoreFacade } from './useTouchStatusBarStoreFacade';

describe('useTouchStatusBarStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTrainingStore.setState(useTrainingStore.getInitialState(), true);
  });

  it('collects touch status bar dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();

    useReconstructionStore.setState({
      reconstruction,
      urlLoading: true,
    });
    useUIStore.setState({
      fps: 48,
      touchUI: {
        statusBar: false,
        galleryFAB: true,
        galleryDrawer: false,
        modalControls: true,
      },
      isIdle: true,
      showAutoHideEditor: true,
    });
    useTrainingStore.setState({ phase: 'uploading' });

    const { result } = renderHook(() => useTouchStatusBarStoreFacade());

    expect(result.current).toEqual({
      fps: 48,
      touchUI: {
        statusBar: false,
        galleryFAB: true,
        galleryDrawer: false,
        modalControls: true,
      },
      autoHideButtons: true,
      isIdle: true,
      showAutoHideEditor: true,
      urlLoading: true,
      reconstruction,
      setShowHotkeyHelp: useUIStore.getState().setShowHotkeyHelp,
      trainingStatus: 'Training · Uploading',
      setTrainingDockOpen: useTrainingStore.getState().setDockOpen,
    });
  });

  it('routes the help entry back to the ui store', () => {
    const { result } = renderHook(() => useTouchStatusBarStoreFacade());

    act(() => {
      result.current.setShowHotkeyHelp(true);
    });

    expect(useUIStore.getState().showHotkeyHelp).toBe(true);
  });

  it('routes the compact training entry to the training store', () => {
    const { result } = renderHook(() => useTouchStatusBarStoreFacade());

    act(() => {
      result.current.setTrainingDockOpen(true);
    });

    expect(useTrainingStore.getState().dockOpen).toBe(true);
  });
});
