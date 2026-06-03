import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore, useUIStore } from '../../store';
import { buildFile, buildLoadedFiles, buildReconstruction } from '../../test/builders';
import { useImageDetailStoreFacade } from './useImageDetailStoreFacade';

describe('useImageDetailStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects image-detail data and UI dependencies', () => {
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({
      reconstruction,
      sourceType: 'local',
      loadedFiles: buildLoadedFiles({ imageFiles: [buildFile('image.jpg')] }),
    });
    useUIStore.setState({
      imageDetailId: 1,
      showPoints2D: true,
      showPoints3D: true,
      showMatchesInModal: true,
      matchedImageId: 2,
      touchMode: true,
      touchUI: {
        ...useUIStore.getState().touchUI,
        modalControls: false,
      },
    });

    const { result } = renderHook(() => useImageDetailStoreFacade());

    expect(result.current.data.reconstruction).toBe(reconstruction);
    expect(result.current.data.wasmReconstruction).toBeNull();
    expect(result.current.data.dataset.getSourceType()).toBe('local');
    expect(result.current.ui).toMatchObject({
      imageDetailId: 1,
      showPoints2D: true,
      showPoints3D: true,
      showMatchesInModal: true,
      matchedImageId: 2,
      touchMode: true,
      showModalControls: false,
    });
  });

  it('routes UI callbacks back to the owning store', () => {
    const { result } = renderHook(() => useImageDetailStoreFacade());

    act(() => {
      result.current.ui.openImageDetail(7);
      result.current.ui.setShowPoints2D(true);
      result.current.ui.setShowPoints3D(true);
      result.current.ui.setMatchedImageId(8);
    });

    expect(useUIStore.getState()).toMatchObject({
      imageDetailId: 7,
      showPoints2D: true,
      showPoints3D: true,
      matchedImageId: 8,
    });

    act(() => {
      result.current.ui.closeImageDetail();
    });

    expect(useUIStore.getState().imageDetailId).toBeNull();
    expect(useUIStore.getState().matchedImageId).toBeNull();
  });
});
