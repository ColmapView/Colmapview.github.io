import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useDeletionStore,
  useReconstructionStore,
} from '../../store';
import {
  buildCamera,
  buildReconstruction,
} from '../../test/builders';
import { useImageDetailDeletionStoreFacade } from './useImageDetailDeletionStoreFacade';

describe('useImageDetailDeletionStoreFacade', () => {
  beforeEach(() => {
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  });

  it('collects deletion state and multi-camera metadata', () => {
    const pendingDeletions = new Set([2, 4]);

    useDeletionStore.setState({ pendingDeletions });
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({
        cameras: [
          buildCamera({ cameraId: 1 }),
          buildCamera({ cameraId: 2 }),
        ],
      }),
    });

    const { result } = renderHook(() => useImageDetailDeletionStoreFacade());

    expect(result.current.data).toEqual({
      multiCamera: true,
      pendingDeletions,
    });
  });

  it('routes deletion actions back to the deletion store', () => {
    const { result } = renderHook(() => useImageDetailDeletionStoreFacade());

    act(() => {
      result.current.actions.toggleDeletion(1);
      result.current.actions.markBulkForDeletion([2, 3]);
      result.current.actions.unmarkBulkDeletion([2]);
    });

    expect(useDeletionStore.getState().pendingDeletions).toEqual(new Set([1, 3]));
  });
});
