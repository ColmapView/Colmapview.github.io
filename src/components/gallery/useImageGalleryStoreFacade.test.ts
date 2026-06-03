import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useCameraStore,
  useDeletionStore,
  useReconstructionStore,
  useUIStore,
} from '../../store';
import type { CameraViewState, NavigationHistoryEntry } from '../../store/types';
import {
  buildFile,
  buildLoadedFiles,
  buildReconstruction,
} from '../../test/builders';
import { useImageGalleryStoreFacade } from './useImageGalleryStoreFacade';

function buildViewState(offset: number): CameraViewState {
  return {
    position: [offset, offset + 1, offset + 2],
    quaternion: [1, 0, 0, 0],
    target: [0, 0, 0],
    distance: offset + 3,
  };
}

describe('useImageGalleryStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects gallery dependencies from owning stores and dataset state', () => {
    const reconstruction = buildReconstruction();
    const imageFile = buildFile('image.jpg');
    const pendingDeletions = new Set([3, 4]);
    const viewState = buildViewState(10);
    const navigationEntry: NavigationHistoryEntry = {
      fromState: buildViewState(1),
      fromImageId: 2,
      toImageId: 5,
    };

    useReconstructionStore.setState({
      reconstruction,
      loadedFiles: buildLoadedFiles({ imageFiles: [imageFile] }),
      sourceType: 'local',
    });
    useDeletionStore.setState({ pendingDeletions });
    useUIStore.setState({
      showMatches: true,
      matchesDisplayMode: 'blink',
      matchesColor: '#123456',
      touchMode: true,
    });
    useCameraStore.setState({
      selectedImageId: 2,
      currentViewState: viewState,
      navigationHistory: [navigationEntry],
    });

    const { result } = renderHook(() => useImageGalleryStoreFacade());

    expect(result.current.data).toMatchObject({
      reconstruction,
      showMatches: true,
      matchesDisplayMode: 'blink',
      matchesColor: '#123456',
      touchMode: true,
      pendingDeletions,
      selectedImageId: 2,
      currentViewState: viewState,
      navigationHistory: [navigationEntry],
    });
    expect(result.current.data.dataset.getImageSync('image.jpg')).toBe(imageFile);
  });

  it('routes gallery actions back to the owning stores', () => {
    const viewState = buildViewState(20);
    const navigationEntry: NavigationHistoryEntry = {
      fromState: buildViewState(2),
      fromImageId: null,
      toImageId: 8,
    };

    const { result } = renderHook(() => useImageGalleryStoreFacade());

    act(() => {
      result.current.actions.setSelectedImageId(8);
      result.current.actions.flyToImage(8);
      result.current.actions.openImageDetail(8);
      result.current.actions.setShowMatchesInModal(true);
      result.current.actions.setMatchedImageId(9);
      result.current.actions.pushNavigationHistory(navigationEntry);
      result.current.actions.flyToState(viewState);
    });

    expect(useCameraStore.getState()).toMatchObject({
      selectedImageId: 8,
      flyToImageId: 8,
      flyToViewState: viewState,
      navigationHistory: [navigationEntry],
    });
    expect(useUIStore.getState()).toMatchObject({
      imageDetailId: 8,
      showMatchesInModal: true,
      matchedImageId: 9,
    });
    expect(result.current.actions.peekNavigationHistory()).toEqual(navigationEntry);

    let poppedEntry: NavigationHistoryEntry | undefined;
    act(() => {
      poppedEntry = result.current.actions.popNavigationHistory();
    });

    expect(poppedEntry).toEqual(navigationEntry);
    expect(useCameraStore.getState().navigationHistory).toEqual([]);
  });
});
