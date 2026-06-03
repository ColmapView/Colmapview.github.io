import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useCameraStore,
  useDeletionStore,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
} from '../../store';
import { buildReconstruction } from '../../test/builders';
import type { Sim3dEuler } from '../../types/sim3d';
import { useScene3DE2EProbeStoreFacade } from './useScene3DE2EProbeStoreFacade';

describe('useScene3DE2EProbeStoreFacade', () => {
  beforeEach(() => {
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects E2E probe data from owning stores', () => {
    const reconstruction = buildReconstruction();
    const pendingDeletions = new Set([3, 4]);
    const autoHideElements = {
      ...useUIStore.getInitialState().autoHideElements,
      cameras: true,
    };
    const transform: Sim3dEuler = {
      scale: 2,
      rotationX: 0.1,
      rotationY: 0.2,
      rotationZ: 0.3,
      translationX: 1,
      translationY: 2,
      translationZ: 3,
    };

    useReconstructionStore.setState({ reconstruction });
    useDeletionStore.setState({ pendingDeletions });
    useCameraStore.setState({
      showCameras: false,
      cameraDisplayMode: 'imageplane',
      cameraScale: 0.75,
      cameraScaleFactor: '10',
      selectedImageId: 42,
    });
    useTransformStore.setState({ transform });
    useUIStore.setState({
      isIdle: true,
      showAutoHideEditor: true,
      autoHideElements,
    });

    const { result } = renderHook(() => useScene3DE2EProbeStoreFacade());

    expect(result.current.data).toMatchObject({
      reconstruction,
      pendingDeletions,
      showCameras: false,
      cameraDisplayMode: 'imageplane',
      cameraScale: 0.75,
      cameraScaleFactor: '10',
      selectedImageId: 42,
      transform,
      isIdle: true,
      showAutoHideEditor: true,
      autoHideElements,
    });
  });

  it('routes E2E probe commands through camera store actions', () => {
    useCameraStore.setState({
      selectedImageId: 7,
      flyToImageId: 9,
      showCameras: false,
      cameraDisplayMode: 'frustum',
      cameraScale: 0.25,
      cameraScaleFactor: '10',
    });

    const { result } = renderHook(() => useScene3DE2EProbeStoreFacade());

    act(() => {
      result.current.actions.setCameraDisplayMode('arrow');
      result.current.actions.setCameraScale(0.5);
      result.current.actions.setSelectedImageId(12);
    });

    expect(useCameraStore.getState()).toMatchObject({
      showCameras: true,
      cameraDisplayMode: 'arrow',
      cameraScale: 0.5,
      cameraScaleFactor: '1',
      selectedImageId: 12,
    });
    expect(result.current.actions.getSelectedImageId()).toBe(12);

    act(() => {
      result.current.actions.clearSelectedImage();
    });

    expect(useCameraStore.getState()).toMatchObject({
      selectedImageId: null,
      flyToImageId: null,
    });
  });
});
