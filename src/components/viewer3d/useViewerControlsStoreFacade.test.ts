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
import { buildCamera, buildFile, buildLoadedFiles, buildReconstruction } from '../../test/builders';
import { CameraModelId } from '../../types/colmap';
import { useViewerControlsStoreFacade } from './useViewerControlsStoreFacade';

describe('useViewerControlsStoreFacade', () => {
  beforeEach(() => {
    useImageMetricsStore.setState(useImageMetricsStore.getInitialState(), true);
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    useSplatBackendStore.getState().setRequestedBackend('auto');
    useSplatBackendStore.getState().setWebGpuBackendState('unavailable');
    useSplatBackendStore.getState().setSparkBackendAvailable(false);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState({
      touchMode: true,
      backgroundColor: '#123456',
      autoHideElements: {
        ...useUIStore.getState().autoHideElements,
        buttons: false,
      },
    });
    usePointCloudStore.setState({
      showPointCloud: true,
      showSplats: true,
      pointSize: 4,
      colorMode: 'splats',
    });
    useCameraStore.setState({
      cameraMode: 'fly',
      cameraProjection: 'orthographic',
      frustumSingleColor: '#abcdef',
      frustumLineWidth: 2.5,
    });
    useUIStore.setState({
      matchesLineWidth: 3,
    });
    useRigStore.setState({
      rigLineWidth: 4,
    });
  });

  it('collects viewer controls UI, node, action, and reconstruction dependencies', () => {
    const reconstruction = buildReconstruction();
    const activeSplatFile = buildFile('model.spz');
    const fallbackSplatFile = buildFile('model.ply');
    useReconstructionStore.setState({
      reconstruction,
      loadedFiles: buildLoadedFiles({
        splatFile: activeSplatFile,
        splatFiles: [activeSplatFile, fallbackSplatFile],
      }),
    });
    useImageMetricsStore.setState({ splatPsnrFrameReady: true });
    useImageMetricsStore.getState().setSplatPsnrMetric({
      imageId: 1,
      psnr: 31,
      mse: 51,
      validPixelCount: 64,
      width: 32,
      height: 24,
      computedAt: 1,
    });

    const { result } = renderHook(() => useViewerControlsStoreFacade());

    expect(result.current.ui).toMatchObject({
      touchMode: true,
      backgroundColor: '#123456',
      autoHideButtons: false,
    });
    expect(result.current.nodes.points).toMatchObject({
      visible: true,
      splatsVisible: true,
      size: 4,
      colorMode: 'splats',
    });
    expect(result.current.nodes.navigation).toMatchObject({
      mode: 'fly',
      projection: 'orthographic',
    });
    expect(result.current.nodes.cameras.singleColor).toBe('#abcdef');
    expect(result.current.nodes.cameras.lineWidth).toBe(2.5);
    expect(result.current.nodes.matches.lineWidth).toBe(3);
    expect(result.current.nodes.rig.lineWidth).toBe(4);
    expect(result.current.metrics).toMatchObject({
      splatPsnrFrameReady: true,
      splatPsnrComputing: false,
      splatPsnrReadyCount: 1,
      splatPsnrTotalCount: 1,
    });
    expect(result.current.splats.activeSplatFile).toBe(activeSplatFile);
    expect(result.current.splats.splatFiles).toEqual([activeSplatFile, fallbackSplatFile]);
    expect(result.current.reconstruction).toBe(reconstruction);
  });

  it('hides PSNR while only Spark CPU metrics are available', () => {
    const activeSplatFile = buildFile('model.spz');
    useReconstructionStore.setState({
      loadedFiles: buildLoadedFiles({ splatFile: activeSplatFile }),
    });
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    useSplatBackendStore.getState().setWebGpuMetricState('ready');

    const { result } = renderHook(() => useViewerControlsStoreFacade());

    expect(result.current.metrics.splatPsnrUnavailableReason)
      .toBe('Spark PSNR/SSIM metric capability is ready');
    expect(result.current.metrics.splatMetricVisualizationsAvailable).toBe(false);
  });

  it('reports metric PSNR unavailability from metric capability state', () => {
    const activeSplatFile = buildFile('model.spz');
    useReconstructionStore.setState({
      loadedFiles: buildLoadedFiles({ splatFile: activeSplatFile }),
    });
    useSplatBackendStore.getState().setWebGpuBackendState('ready');
    useSplatBackendStore.getState().setWebGpuMetricState('failed', 'adapter unavailable');

    const { result } = renderHook(() => useViewerControlsStoreFacade());

    expect(result.current.metrics.splatPsnrUnavailableReason)
      .toBe('WebGPU PSNR failed to initialize: adapter unavailable');
  });

  it('routes action facade callbacks back to owning stores', () => {
    const { result } = renderHook(() => useViewerControlsStoreFacade());

    act(() => {
      result.current.actions.points.setVisible(true);
      result.current.actions.points.setSplatsVisible(false);
      result.current.actions.navigation.setProjection('perspective');
      result.current.actions.matches.setLineWidth(2);
      result.current.actions.rig.setLineWidth(5);
      result.current.ui.setBackgroundColor('#ffffff');
    });

    expect(usePointCloudStore.getState().showPointCloud).toBe(true);
    expect(usePointCloudStore.getState().showSplats).toBe(false);
    expect(usePointCloudStore.getState().colorMode).toBe('rgb');
    expect(useCameraStore.getState().cameraProjection).toBe('perspective');
    expect(useUIStore.getState().matchesLineWidth).toBe(2);
    expect(useRigStore.getState().rigLineWidth).toBe(5);
    expect(useUIStore.getState().backgroundColor).toBe('#ffffff');
  });

  it('switches the active splat file and clears stale PSNR metrics', () => {
    const activeSplatFile = buildFile('model.spz');
    const fallbackSplatFile = buildFile('model.ply');
    useReconstructionStore.setState({
      loadedFiles: buildLoadedFiles({
        splatFile: activeSplatFile,
        splatFiles: [activeSplatFile, fallbackSplatFile],
      }),
    });
    useImageMetricsStore.setState({ splatPsnrFrameReady: true });
    useImageMetricsStore.getState().setSplatPsnrMetric({
      imageId: 1,
      psnr: 31,
      mse: 51,
      validPixelCount: 64,
      width: 32,
      height: 24,
      computedAt: 1,
    });
    usePointCloudStore.setState({ colorMode: 'rgb', showSplats: false });

    const { result } = renderHook(() => useViewerControlsStoreFacade());

    act(() => {
      result.current.splats.setActiveSplatFile(fallbackSplatFile);
    });

    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(fallbackSplatFile);
    expect(usePointCloudStore.getState().colorMode).toBe('rgb');
    expect(usePointCloudStore.getState().showSplats).toBe(false);
    expect(useImageMetricsStore.getState().splatPsnrFrameReady).toBe(false);
    expect(useImageMetricsStore.getState().splatPsnrMetrics.size).toBe(0);
  });

  it('hides splat metric visualizations for a spherical-only reconstruction', () => {
    const activeSplatFile = buildFile('model.spz');
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({
        cameras: [buildCamera({ cameraId: 1, modelId: CameraModelId.EQUIRECTANGULAR, params: [640, 480] })],
      }),
      loadedFiles: buildLoadedFiles({ splatFile: activeSplatFile }),
    });
    // WebGPU PSNR is fully ready — the only reason to hide is the spherical-only camera set,
    // which SplatPsnrEvaluator can never produce a metric for.
    useSplatBackendStore.getState().setWebGpuBackendState('ready');
    useSplatBackendStore.getState().setWebGpuMetricState('ready');

    const { result } = renderHook(() => useViewerControlsStoreFacade());

    expect(result.current.metrics.splatMetricVisualizationsAvailable).toBe(false);
  });

  it('keeps splat metric visualizations for a mixed reconstruction that has a pinhole camera', () => {
    const activeSplatFile = buildFile('model.spz');
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({
        cameras: [
          buildCamera({ cameraId: 1, modelId: CameraModelId.EQUIRECTANGULAR, params: [640, 480] }),
          buildCamera({ cameraId: 2, modelId: CameraModelId.PINHOLE }),
        ],
      }),
      loadedFiles: buildLoadedFiles({ splatFile: activeSplatFile }),
    });
    useSplatBackendStore.getState().setWebGpuBackendState('ready');
    useSplatBackendStore.getState().setWebGpuMetricState('ready');

    const { result } = renderHook(() => useViewerControlsStoreFacade());

    expect(result.current.metrics.splatMetricVisualizationsAvailable).toBe(true);
  });
});
