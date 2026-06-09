import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useNotificationStore,
  usePointCloudStore,
  useReconstructionStore,
  useSplatBackendStore,
} from '../../../store';
import { buildFile, buildLoadedFiles } from '../../../test/builders';
import { useSplatLayerStoreFacade } from './SplatLayerStoreFacade';

describe('useSplatLayerStoreFacade', () => {
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
