import { createElement, type ReactNode } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
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
import { buildFile, buildLoadedFiles, buildReconstruction } from '../../test/builders';
import { beginReconstructionLoad, markReconstructionSceneCommitted } from '../../wasm/reconstructionLoadLifecycle';
import { useViewerControlsController } from './useViewerControlsController';

function setWebGpuSplatMetricsReady() {
  useSplatBackendStore.getState().setRequestedBackend('webgpu');
  useSplatBackendStore.getState().setWebGpuBackendState('ready');
  useSplatBackendStore.getState().setWebGpuMetricState('ready');
}

function setWebGpuSplatMetricsPreparing() {
  useSplatBackendStore.getState().setRequestedBackend('webgpu');
  useSplatBackendStore.getState().setWebGpuBackendState('ready');
  useSplatBackendStore.getState().setWebGpuMetricState('unavailable');
}

function setSparkSplatBackendActive() {
  useSplatBackendStore.getState().setSparkBackendAvailable(true);
  useSplatBackendStore.getState().setRequestedBackend('spark');
}

function hotkeyWrapper({ children }: { children: ReactNode }) {
  return createElement(HotkeysProvider, { initiallyActiveScopes: ['viewer'], children });
}

function pressKey(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, code: `Key${key.toUpperCase()}`, bubbles: true }));
  });
}

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
    setWebGpuSplatMetricsReady();
    useImageMetricsStore.setState({ splatPsnrFrameReady: true });
    usePointCloudStore.setState({ showPointCloud: true, colorMode: 'rgb', showSplats: false });
    useCameraStore.setState({ frustumColorMode: 'byCamera' });
    useReconstructionStore.setState({
      reconstruction: buildReconstruction(),
      loadedFiles: buildLoadedFiles({ splatFile }),
    });
    const { result } = renderHook(() => useViewerControlsController());

    act(() => {
      result.current.pointCloudPanel.setColorMode('splats');
    });

    expect(usePointCloudStore.getState().colorMode).toBe('splats');
    expect(useCameraStore.getState().frustumColorMode).toBe('splatPsnr');
  });

  it('defaults camera frustum coloring to PSNR when the point button cycles into Gaussian mode', () => {
    const splatFile = buildFile('scene.spz', 'splat');
    setWebGpuSplatMetricsReady();
    useImageMetricsStore.setState({ splatPsnrFrameReady: true });
    usePointCloudStore.setState({ showPointCloud: true, colorMode: 'trackLength', showSplats: false });
    useCameraStore.setState({ frustumColorMode: 'single' });
    useReconstructionStore.setState({
      reconstruction: buildReconstruction(),
      loadedFiles: buildLoadedFiles({ splatFile }),
    });
    const { result } = renderHook(() => useViewerControlsController());

    act(() => {
      result.current.pointCloudPanel.onCycleColorMode();
    });

    expect(usePointCloudStore.getState().colorMode).toBe('splats');
    expect(useCameraStore.getState().frustumColorMode).toBe('splatPsnr');
  });

  it('defaults camera frustum coloring to PSNR before metric coloring is ready', () => {
    const splatFile = buildFile('scene.spz', 'splat');
    setWebGpuSplatMetricsPreparing();
    useImageMetricsStore.setState({ splatPsnrFrameReady: false });
    usePointCloudStore.setState({ showPointCloud: true, colorMode: 'rgb', showSplats: false });
    useCameraStore.setState({ frustumColorMode: 'byCamera' });
    useReconstructionStore.setState({
      reconstruction: buildReconstruction(),
      loadedFiles: buildLoadedFiles({ splatFile }),
    });
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
    setWebGpuSplatMetricsReady();
    useImageMetricsStore.setState({ splatPsnrFrameReady: true });
    useCameraStore.setState({ frustumColorMode: 'byCamera' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction() });
    act(() => {
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFile }));
    });

    renderHook(() => useViewerControlsController());

    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
    expect(useCameraStore.getState().frustumColorMode).toBe('splatPsnr');
  });

  it('defaults initial loaded splat camera frustum coloring to PSNR before metrics are ready', () => {
    const splatFile = buildFile('scene.spz', 'splat');
    setWebGpuSplatMetricsPreparing();
    useImageMetricsStore.setState({ splatPsnrFrameReady: false });
    useCameraStore.setState({ frustumColorMode: 'byCamera' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction() });
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
    setWebGpuSplatMetricsPreparing();
    useImageMetricsStore.setState({ splatPsnrFrameReady: false });
    useCameraStore.setState({ frustumColorMode: 'byCamera' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction() });
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

  it('disables stale splat metric camera coloring while Spark is active', () => {
    const splatFile = buildFile('scene.spz', 'splat');
    setSparkSplatBackendActive();
    useImageMetricsStore.setState({ splatPsnrFrameReady: true });
    useCameraStore.setState({ frustumColorMode: 'splatSsim' });
    useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({ splatFile }) });

    const { result } = renderHook(() => useViewerControlsController());

    expect(useCameraStore.getState().frustumColorMode).toBe('byCamera');
    expect(result.current.cameraDisplayPanel.splatMetricVisualizationsAvailable).toBe(false);

    act(() => {
      result.current.pointCloudPanel.setColorMode('splats');
    });

    expect(useCameraStore.getState().frustumColorMode).toBe('byCamera');
  });

  it('ignores N while a dataset load replaces the scene and cycles again once it ends', () => {
    const first = buildFile('a.spz', 'a');
    const second = buildFile('b.spz', 'b');
    useReconstructionStore.setState({
      reconstruction: buildReconstruction(),
      loadedFiles: buildLoadedFiles({ splatFile: first, splatFiles: [first, second], splatFileSources: [
        { id: 'a.spz', path: 'a.spz', file: first }, { id: 'b.spz', path: 'b.spz', file: second }] }),
    });
    renderHook(() => useViewerControlsController(), { wrapper: hotkeyWrapper });
    const revision = useReconstructionStore.getState().splatSelectionRevision;
    const load = beginReconstructionLoad();
    try {
      pressKey('n');
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(first);
      expect(useReconstructionStore.getState().splatSelectionRevision).toBe(revision);
    } finally {
      load.finish();
    }
    pressKey('n');
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(second);
  });

  it.each(['panel None', 'panel tile', 'N'] as const)('keeps a URL download and its Cancel when %s tries to change the old scene', choice => {
    const first = buildFile('a.spz', 'a');
    const second = buildFile('b.spz', 'b');
    useReconstructionStore.setState({
      reconstruction: buildReconstruction(),
      loadedFiles: buildLoadedFiles({ splatFile: first, splatFiles: [first, second], splatFileSources: [
        { id: 'a.spz', path: 'a.spz', file: first }, { id: 'b.spz', path: 'b.spz', file: second }] }),
    });
    const { result } = renderHook(() => useViewerControlsController(), { wrapper: hotkeyWrapper });
    const store = useReconstructionStore.getState;
    const signal = store().tryStartUrlLoad()!;
    const revision = store().splatSelectionRevision;
    const progress = { percent: 25, message: 'Downloading dataset ZIP...' };
    try {
      act(() => useReconstructionStore.setState({ urlLoading: true, urlProgress: progress }));
      if (choice === 'N') pressKey('n');
      else act(() => result.current.pointCloudPanel.onSelectSplatSource(choice === 'panel None' ? '' : 'b.spz'));
      expect(store()).toMatchObject({ urlLoading: true, urlLoadActive: true, urlProgress: progress, splatSelectionRevision: revision });
      expect(store().loadedFiles?.splatFile).toBe(first);
      act(() => store().cancelLoading());
      expect(signal.aborted).toBe(true);
    } finally {
      act(() => store().finishUrlLoad(signal));
    }
  });

  it('allows a scene splat choice once a URL load commits and only its restoration remains', () => {
    const first = buildFile('a.spz', 'a');
    const second = buildFile('b.spz', 'b');
    const store = useReconstructionStore.getState;
    const signal = store().tryStartUrlLoad()!;
    const parsing = beginReconstructionLoad();
    useReconstructionStore.setState({ reconstruction: buildReconstruction(),
      loadedFiles: buildLoadedFiles({ splatFile: first, splatFiles: [first, second], splatFileSources: [
        { id: 'a.spz', path: 'a.spz', file: first }, { id: 'b.spz', path: 'b.spz', file: second }] }) });
    markReconstructionSceneCommitted(parsing.signal, signal);
    parsing.finish();
    const { result } = renderHook(() => useViewerControlsController());
    try {
      act(() => result.current.pointCloudPanel.onSelectSplatSource('b.spz'));
      expect(store().loadedFiles?.splatFile).toBe(second);
      expect(signal.aborted).toBe(false);
      expect(store().urlLoadActive).toBe(true);
    } finally {
      act(() => store().finishUrlLoad(signal));
    }
  });

  it.each([['None', ''], ['another splat', 'b.spz']])(
    'ignores %s picked in the Point Cloud panel while a dataset load replaces the scene', (_label, sourceId) => {
      const first = buildFile('a.spz', 'a');
      const second = buildFile('b.spz', 'b');
      useReconstructionStore.setState({
        reconstruction: buildReconstruction(),
        loadedFiles: buildLoadedFiles({ splatFile: first, splatFiles: [first, second], splatFileSources: [
          { id: 'a.spz', path: 'a.spz', file: first }, { id: 'b.spz', path: 'b.spz', file: second }] }),
      });
      const { result } = renderHook(() => useViewerControlsController(), { wrapper: hotkeyWrapper });
      const revision = useReconstructionStore.getState().splatSelectionRevision;
      const parsing = { percent: 20, message: 'Parsing COLMAP files...' };
      const load = beginReconstructionLoad();
      try {
        useReconstructionStore.setState({ urlLoading: true, urlProgress: parsing });
        act(() => result.current.pointCloudPanel.onSelectSplatSource(sourceId));
        // The load keeps its overlay and Cancel, and the scene it replaces keeps its splat.
        expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true, urlProgress: parsing,
          splatSelectionRevision: revision });
        expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(first);
      } finally {
        load.finish();
      }
      act(() => result.current.pointCloudPanel.onSelectSplatSource(sourceId));
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(sourceId ? second : undefined);
    });
});
