import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useCameraStore,
  useImageMetricsStore,
  usePointCloudStore,
  useReconstructionStore,
  useRigStore,
  useSplatBackendStore,
  useUIStore,
} from '../../store';
import { useViewerControlsController } from './useViewerControlsController';

describe('useViewerControlsController', () => {
  beforeEach(() => {
    useImageMetricsStore.setState(useImageMetricsStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useRigStore.setState(useRigStore.getInitialState(), true);
  });

  it('defaults camera frustum coloring to PSNR when points switch into Gaussian mode', () => {
    useImageMetricsStore.setState({ splatPsnrFrameReady: true });
    usePointCloudStore.setState({ showPointCloud: true, colorMode: 'rgb', showSplats: false });
    useCameraStore.setState({ frustumColorMode: 'byCamera' });
    const { result } = renderHook(() => useViewerControlsController());

    act(() => {
      result.current.pointCloudPanel.setColorMode('splats');
    });

    expect(usePointCloudStore.getState().colorMode).toBe('splats');
    expect(useCameraStore.getState().frustumColorMode).toBe('splatPsnr');
  });

  it('defaults camera frustum coloring to PSNR when the point button cycles into Gaussian mode', () => {
    useImageMetricsStore.setState({ splatPsnrFrameReady: true });
    usePointCloudStore.setState({ showPointCloud: true, colorMode: 'trackLength', showSplats: false });
    useCameraStore.setState({ frustumColorMode: 'single' });
    const { result } = renderHook(() => useViewerControlsController());

    act(() => {
      result.current.pointCloudPanel.onCycleColorMode();
    });

    expect(usePointCloudStore.getState().colorMode).toBe('splats');
    expect(useCameraStore.getState().frustumColorMode).toBe('splatPsnr');
  });

  it('applies the PSNR camera color default once metric coloring becomes ready', () => {
    useImageMetricsStore.setState({ splatPsnrFrameReady: false });
    usePointCloudStore.setState({ showPointCloud: true, colorMode: 'rgb', showSplats: false });
    useCameraStore.setState({ frustumColorMode: 'byCamera' });
    const { result } = renderHook(() => useViewerControlsController());

    act(() => {
      result.current.pointCloudPanel.setColorMode('splats');
    });

    expect(useCameraStore.getState().frustumColorMode).toBe('byCamera');

    act(() => {
      useImageMetricsStore.setState({ splatPsnrFrameReady: true });
    });

    expect(useCameraStore.getState().frustumColorMode).toBe('splatPsnr');
  });
});
