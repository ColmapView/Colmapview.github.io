import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store/reconstructionStore';
import { useUIStore } from '../../store/stores/uiStore';
import { buildReconstruction } from '../../test/builders/colmapBuilders';
import { useTouchStatusBarStoreFacade } from './useTouchStatusBarStoreFacade';

describe('useTouchStatusBarStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
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
    });
  });
});
