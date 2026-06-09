import { describe, expect, it } from 'vitest';
import type { CameraViewState, NavigationHistoryEntry } from '../../store/types';
import { getImageGalleryRightClickAction } from './imageGalleryRightClickPolicy';

describe('image gallery right-click policy', () => {
  it('deselects when right-clicking the selected image without navigation history', () => {
    expect(getImageGalleryRightClickAction({
      imageId: 10,
      selectedImageId: 10,
      isMatchedImage: false,
      currentViewState: buildViewState(1),
      lastNavigationEntry: buildNavigationEntry(20),
    })).toEqual({
      type: 'deselect',
    });
  });

  it('restores navigation before matched-image handling when right-clicking the selected navigation target', () => {
    expect(getImageGalleryRightClickAction({
      imageId: 10,
      selectedImageId: 10,
      isMatchedImage: true,
      currentViewState: buildViewState(1),
      lastNavigationEntry: buildNavigationEntry(10),
    })).toEqual({
      type: 'restoreNavigation',
    });
  });

  it('opens the selected image detail modal when clicking a matched image', () => {
    expect(getImageGalleryRightClickAction({
      imageId: 20,
      selectedImageId: 10,
      isMatchedImage: true,
      currentViewState: buildViewState(1),
      lastNavigationEntry: buildNavigationEntry(20),
    })).toEqual({
      type: 'openMatchedImageDetail',
      selectedImageId: 10,
      matchedImageId: 20,
    });
  });

  it('restores navigation when clicking the current navigation target', () => {
    expect(getImageGalleryRightClickAction({
      imageId: 20,
      selectedImageId: 10,
      isMatchedImage: false,
      currentViewState: buildViewState(1),
      lastNavigationEntry: buildNavigationEntry(20),
    })).toEqual({
      type: 'restoreNavigation',
    });
  });

  it('navigates with a history entry when a current view state exists', () => {
    const currentViewState = buildViewState(3);

    expect(getImageGalleryRightClickAction({
      imageId: 20,
      selectedImageId: 10,
      isMatchedImage: false,
      currentViewState,
      lastNavigationEntry: buildNavigationEntry(30),
    })).toEqual({
      type: 'navigateToImage',
      imageId: 20,
      navigationEntry: {
        fromState: currentViewState,
        fromImageId: 10,
        toImageId: 20,
      },
    });
  });

  it('navigates without history when no current view state exists', () => {
    expect(getImageGalleryRightClickAction({
      imageId: 20,
      selectedImageId: null,
      isMatchedImage: true,
      currentViewState: null,
      lastNavigationEntry: buildNavigationEntry(20),
    })).toEqual({
      type: 'navigateToImage',
      imageId: 20,
      navigationEntry: null,
    });
  });
});

function buildNavigationEntry(toImageId: number): NavigationHistoryEntry {
  return {
    fromState: buildViewState(toImageId),
    fromImageId: null,
    toImageId,
  };
}

function buildViewState(offset: number): CameraViewState {
  return {
    position: [offset, 0, 0],
    quaternion: [1, 0, 0, 0],
    target: [0, 0, 0],
    distance: 1,
  };
}
