import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store/reconstructionStore';
import { useUIStore } from '../../store/stores/uiStore';
import { buildReconstruction } from '../../test/builders/colmapBuilders';
import { useStatusBarStoreFacade } from './useStatusBarStoreFacade';

describe('useStatusBarStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects status bar dependencies from owning stores', () => {
    const reconstruction = buildReconstruction({
      globalStats: {
        avgTrackLength: 3.5,
        avgError: 0.25,
      },
    });

    useReconstructionStore.setState({
      reconstruction,
      wasmReconstruction: null,
      urlLoading: true,
    });
    useUIStore.setState({ fps: 61 });

    const { result } = renderHook(() => useStatusBarStoreFacade());

    expect(result.current).toEqual({
      urlLoading: true,
      reconstruction,
      wasmReconstruction: null,
      fps: 61,
      autoHideButtons: true,
      isIdle: false,
      showAutoHideEditor: false,
    });
  });
});
