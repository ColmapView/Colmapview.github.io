import { describe, expect, it } from 'vitest';
import type { CameraViewState, NavigationHistoryEntry } from '../store/types';
import { buildImage, buildReconstruction } from '../test/builders';
import {
  buildMatchedImageIds,
  getLastNavigationToImageId,
} from './imageNavigationPolicy';

describe('image navigation policy', () => {
  it('derives matched image IDs only when a selected image is showing matches', () => {
    const selectedImage = buildImage({ imageId: 10 });
    const matchedImage = buildImage({ imageId: 20 });
    const reconstruction = buildReconstruction({
      images: [selectedImage, matchedImage],
      connectedImagesIndex: new Map([[selectedImage.imageId, new Map([[matchedImage.imageId, 7]])]]),
    });

    expect(buildMatchedImageIds(reconstruction, selectedImage.imageId, true)).toEqual(new Set([matchedImage.imageId]));
    expect(buildMatchedImageIds(reconstruction, selectedImage.imageId, false)).toEqual(new Set());
    expect(buildMatchedImageIds(reconstruction, null, true)).toEqual(new Set());
    expect(buildMatchedImageIds(null, selectedImage.imageId, true)).toEqual(new Set());
  });

  it('returns the latest navigation target image ID', () => {
    const navigationHistory: NavigationHistoryEntry[] = [
      { fromState: buildViewState(0), fromImageId: null, toImageId: 10 },
      { fromState: buildViewState(1), fromImageId: 10, toImageId: 20 },
    ];

    expect(getLastNavigationToImageId(navigationHistory)).toBe(20);
    expect(getLastNavigationToImageId([])).toBeNull();
  });
});

function buildViewState(offset: number): CameraViewState {
  return {
    position: [offset, 0, 0],
    quaternion: [1, 0, 0, 0],
    target: [0, 0, 0],
    distance: 1,
  };
}
