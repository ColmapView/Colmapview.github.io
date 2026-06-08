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
import { buildFile, buildLoadedFiles } from '../../test/builders';
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
    const splatFile = buildFile('scene.spz', 'splat');
    useImageMetricsStore.setState({ splatPsnrFrameReady: true });
    usePointCloudStore.setState({ showPointCloud: true, colorMode: 'rgb', showSplats: false });
    useCameraStore.setState({ frustumColorMode: 'byCamera' });
    useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({ splatFile }) });
    const { result } = renderHook(() => useViewerControlsController());

    act(() => {
      result.current.pointCloudPanel.setColorMode('splats');
    });

    expect(usePointCloudStore.getState().colorMode).toBe('splats');
    expect(useCameraStore.getState().frustumColorMode).toBe('splatPsnr');
  });

  it('defaults camera frustum coloring to PSNR when the point button cycles into Gaussian mode', () => {
    const splatFile = buildFile('scene.spz', 'splat');
    useImageMetricsStore.setState({ splatPsnrFrameReady: true });
    usePointCloudStore.setState({ showPointCloud: true, colorMode: 'trackLength', showSplats: false });
    useCameraStore.setState({ frustumColorMode: 'single' });
    useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({ splatFile }) });
    const { result } = renderHook(() => useViewerControlsController());

    act(() => {
      result.current.pointCloudPanel.onCycleColorMode();
    });

    expect(usePointCloudStore.getState().colorMode).toBe('splats');
    expect(useCameraStore.getState().frustumColorMode).toBe('splatPsnr');
  });

  it('defaults camera frustum coloring to PSNR before metric coloring is ready', () => {
    const splatFile = buildFile('scene.spz', 'splat');
    useImageMetricsStore.setState({ splatPsnrFrameReady: false });
    usePointCloudStore.setState({ showPointCloud: true, colorMode: 'rgb', showSplats: false });
    useCameraStore.setState({ frustumColorMode: 'byCamera' });
    useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({ splatFile }) });
    const { result } = renderHook(() => useViewerControlsController());

    act(() => {
      result.current.pointCloudPanel.setColorMode('splats');
    });

    expect(useCameraStore.getState().frustumColorMode).toBe('splatPsnr');

    act(() => {
      useImageMetricsStore.setState({ splatPsnrFrameReady: true });
    });

    expect(useCameraStore.getState().frustumColorMode).toBe('splatPsnr');
  });

  it('defaults initial loaded splat camera frustum coloring to PSNR when metrics are ready', () => {
    const splatFile = buildFile('scene.spz', 'splat');
    useImageMetricsStore.setState({ splatPsnrFrameReady: true });
    useCameraStore.setState({ frustumColorMode: 'byCamera' });
    act(() => {
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFile }));
    });

    renderHook(() => useViewerControlsController());

    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
    expect(useCameraStore.getState().frustumColorMode).toBe('splatPsnr');
  });

  it('defaults initial loaded splat camera frustum coloring to PSNR before metrics are ready', () => {
    const splatFile = buildFile('scene.spz', 'splat');
    useImageMetricsStore.setState({ splatPsnrFrameReady: false });
    useCameraStore.setState({ frustumColorMode: 'byCamera' });
    act(() => {
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFile }));
    });
    renderHook(() => useViewerControlsController());

    expect(useCameraStore.getState().frustumColorMode).toBe('splatPsnr');

    act(() => {
      useImageMetricsStore.setState({ splatPsnrFrameReady: true });
    });

    expect(useCameraStore.getState().frustumColorMode).toBe('splatPsnr');
  });

  it('keeps a user camera color choice made after the initial loaded splat default', () => {
    const splatFile = buildFile('scene.spz', 'splat');
    useImageMetricsStore.setState({ splatPsnrFrameReady: false });
    useCameraStore.setState({ frustumColorMode: 'byCamera' });
    act(() => {
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFile }));
    });
    renderHook(() => useViewerControlsController());

    expect(useCameraStore.getState().frustumColorMode).toBe('splatPsnr');

    act(() => {
      useCameraStore.getState().setFrustumColorMode('single');
    });
    act(() => {
      useImageMetricsStore.setState({ splatPsnrFrameReady: true });
    });

    expect(useCameraStore.getState().frustumColorMode).toBe('single');
  });

  it('clears stale splat camera coloring when no active splat remains', () => {
    useImageMetricsStore.setState({ splatPsnrFrameReady: false });
    useCameraStore.setState({ frustumColorMode: 'splatPsnr' });

    renderHook(() => useViewerControlsController());

    expect(useCameraStore.getState().frustumColorMode).toBe('byCamera');
  });
});
