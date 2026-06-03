import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useCameraStore,
  useDeletionStore,
  useFloorPlaneStore,
  useReconstructionStore,
  useUIStore,
} from '../../store';
import {
  buildCamera,
  buildImage,
  buildReconstruction,
} from '../../test/builders';
import { useDeletionModalStoreFacade } from './useDeletionModalStoreFacade';

describe('useDeletionModalStoreFacade', () => {
  beforeEach(() => {
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
    useFloorPlaneStore.setState(useFloorPlaneStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects deletion-modal dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();
    const pendingDeletions = new Set([1, 2]);

    useReconstructionStore.setState({ reconstruction });
    useDeletionStore.setState({ pendingDeletions });

    const { result } = renderHook(() => useDeletionModalStoreFacade());

    expect(result.current.data).toEqual({
      reconstruction,
      pendingDeletions,
    });
    expect(typeof result.current.actions.unmarkDeletion).toBe('function');
    expect(typeof result.current.actions.markBulkForDeletion).toBe('function');
    expect(typeof result.current.actions.openImageDetail).toBe('function');
    expect(typeof result.current.actions.applyDeletions).toBe('function');
    expect(typeof result.current.actions.resetDeletions).toBe('function');
  });

  it('routes modal actions back to owning stores and coordinated deletion actions', () => {
    const camera = buildCamera({ cameraId: 1 });
    const imageA = buildImage({ imageId: 1, cameraId: camera.cameraId, name: 'a.jpg' });
    const imageB = buildImage({ imageId: 2, cameraId: camera.cameraId, name: 'b.jpg' });
    const reconstruction = buildReconstruction({
      cameras: [camera],
      images: [imageA, imageB],
    });

    useReconstructionStore.setState({ reconstruction });
    useDeletionStore.setState({ pendingDeletions: new Set([1]) });

    const { result } = renderHook(() => useDeletionModalStoreFacade());

    act(() => {
      result.current.actions.unmarkDeletion(1);
      result.current.actions.markBulkForDeletion([1, 2]);
      result.current.actions.openImageDetail(2);
    });

    expect(useDeletionStore.getState().pendingDeletions).toEqual(new Set([1, 2]));
    expect(useUIStore.getState().imageDetailId).toBe(2);

    act(() => {
      result.current.actions.resetDeletions();
    });

    expect(useDeletionStore.getState().pendingDeletions).toEqual(new Set());

    act(() => {
      result.current.actions.markBulkForDeletion([1]);
    });

    let applied = false;
    act(() => {
      applied = result.current.actions.applyDeletions();
    });

    expect(applied).toBe(true);
    expect(useReconstructionStore.getState().reconstruction?.images.has(1)).toBe(false);
    expect(useReconstructionStore.getState().reconstruction?.images.has(2)).toBe(true);
    expect(useDeletionStore.getState().pendingDeletions).toEqual(new Set());
  });
});
