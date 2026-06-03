import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useCameraStore,
  usePointCloudStore,
  useReconstructionStore,
  useUIStore,
} from '../../store';
import { buildReconstruction } from '../../test/builders';
import { useViewerControlsStoreFacade } from './useViewerControlsStoreFacade';

describe('useViewerControlsStoreFacade', () => {
  beforeEach(() => {
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
    });
  });

  it('collects viewer controls UI, node, action, and reconstruction dependencies', () => {
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({ reconstruction });

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
    expect(result.current.reconstruction).toBe(reconstruction);
  });

  it('routes action facade callbacks back to owning stores', () => {
    const { result } = renderHook(() => useViewerControlsStoreFacade());

    act(() => {
      result.current.actions.points.setVisible(true);
      result.current.actions.points.setSplatsVisible(false);
      result.current.actions.navigation.setProjection('perspective');
      result.current.ui.setBackgroundColor('#ffffff');
    });

    expect(usePointCloudStore.getState().showPointCloud).toBe(true);
    expect(usePointCloudStore.getState().showSplats).toBe(false);
    expect(usePointCloudStore.getState().colorMode).toBe('rgb');
    expect(useCameraStore.getState().cameraProjection).toBe('perspective');
    expect(useUIStore.getState().backgroundColor).toBe('#ffffff');
  });
});
