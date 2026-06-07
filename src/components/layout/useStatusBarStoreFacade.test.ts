import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store/reconstructionStore';
import { useImageMetricsStore } from '../../store/stores/imageMetricsStore';
import { useUIStore } from '../../store/stores/uiStore';
import { buildFile, buildLoadedFiles, buildReconstruction } from '../../test/builders/colmapBuilders';
import { useStatusBarStoreFacade } from './useStatusBarStoreFacade';

describe('useStatusBarStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useImageMetricsStore.setState(useImageMetricsStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects status bar dependencies from owning stores', () => {
    const reconstruction = buildReconstruction({
      globalStats: {
        avgTrackLength: 3.5,
        avgError: 0.25,
      },
    });
    const splatPsnrByImage = new Map([[
      1,
      {
        imageId: 1,
        psnr: 31,
        mse: 3,
        validPixelCount: 100,
        width: 10,
        height: 10,
        computedAt: 123,
      },
    ]]);

    useReconstructionStore.setState({
      reconstruction,
      wasmReconstruction: null,
      loadedFiles: buildLoadedFiles({ splatFile: buildFile('scene.spz', 'splat') }),
      urlLoading: true,
    });
    useImageMetricsStore.setState({
      splatPsnrFrameReady: true,
      splatPsnrMetrics: splatPsnrByImage,
    });
    useUIStore.setState({ fps: 61 });

    const { result } = renderHook(() => useStatusBarStoreFacade());

    expect(result.current).toEqual({
      urlLoading: true,
      reconstruction,
      wasmReconstruction: null,
      hasSplatFile: true,
      splatPsnrFrameReady: true,
      splatPsnrByImage,
      fps: 61,
      autoHideButtons: true,
      isIdle: false,
      showAutoHideEditor: false,
    });
  });
});
