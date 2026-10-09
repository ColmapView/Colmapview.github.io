import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useNotificationStore,
  usePointCloudStore,
  useReconstructionStore,
  useSplatBackendStore,
} from '../../../store';
import { buildPendingFetch, buildFile, buildLoadedFiles } from '../../../test/builders';
import { useSplatLayerStoreFacade } from './SplatLayerStoreFacade';
import { beginReconstructionLoad } from '../../../wasm/reconstructionLoadLifecycle';

describe('useSplatLayerStoreFacade', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState());
    useReconstructionStore.setState({
      loadedFiles: null,
    });
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
  });

  it('exposes splat visibility and the resolved dataset splat file', () => {
    const splatFile = buildFile('scene.ply', 'splat');
    usePointCloudStore.setState({ showPointCloud: true, colorMode: 'splatPoints' });
    useReconstructionStore.setState({
      loadedFiles: buildLoadedFiles({ splatFile }),
    });
    useSplatBackendStore.getState().setRequestedBackend('webgpu');

    const { result } = renderHook(() => useSplatLayerStoreFacade());

    expect(result.current.data).toMatchObject({
      showSplats: true,
      splatFile,
      requestedBackend: 'webgpu',
    });
    expect(result.current.data.splatBackendResolution.status).toBe('unavailable');
  });

  it('leaves the scene without a splat the renderer could not draw', () => {
    const splatFile = buildFile('scene.ply', 'splat');
    // A COLMAP scene stays on screen without it (a splat-only one would go back to the landing page).
    useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({ splatFile, camerasFile: buildFile('cameras.bin'),
      splatFileSources: [{ id: 'scene.ply', path: 'scene.ply', file: splatFile }] }) });
    const { result } = renderHook(() => useSplatLayerStoreFacade());

    act(() => { result.current.actions.dropFailedSplat(splatFile); });

    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(1);
  });

  it('says whether a dataset load is pending, which then owns the loading state', () => {
    const { result } = renderHook(() => useSplatLayerStoreFacade());
    expect(result.current.actions.isDatasetLoadPending()).toBe(false);

    const load = beginReconstructionLoad();
    expect(result.current.actions.isDatasetLoadPending()).toBe(true);
    load.finish();
    expect(result.current.actions.isDatasetLoadPending()).toBe(false);
  });

  it('says whether a tile download is pending, which then owns the loading state', async () => {
    const pendingFetch = buildPendingFetch();
    vi.stubGlobal('fetch', vi.fn(pendingFetch.fetch));
    useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({
      splatFileSources: [{ id: 'tile.ply', path: 'tile.ply', url: 'https://x/tile.ply', size: 1 }] }) });
    const { result } = renderHook(() => useSplatLayerStoreFacade());
    expect(result.current.actions.isSplatDownloadPending()).toBe(false);

    const download = useReconstructionStore.getState().selectSplatSource('tile.ply');
    expect(result.current.actions.isSplatDownloadPending()).toBe(true);
    useReconstructionStore.getState().cancelLoading();
    await download;
    expect(result.current.actions.isSplatDownloadPending()).toBe(false);
  });

  it('routes splat loading notifications to the notification store', () => {
    const { result, rerender } = renderHook(() => useSplatLayerStoreFacade());
    const initialGetUrlProgress = result.current.actions.getUrlProgress;

    const id = result.current.actions.addNotification('info', 'Loading splat: scene.ply', 0);

    expect(useNotificationStore.getState().notifications).toMatchObject([
      {
        id,
        type: 'info',
        message: 'Loading splat: scene.ply',
        duration: 0,
      },
    ]);

    result.current.actions.removeNotification(id);

    expect(useNotificationStore.getState().notifications).toEqual([]);

    act(() => {
      result.current.actions.setSparkBackendAvailable(true);
    });

    expect(useSplatBackendStore.getState().availability.spark).toBe(true);
    rerender();
    expect(result.current.actions.getUrlProgress).toBe(initialGetUrlProgress);
  });
});
