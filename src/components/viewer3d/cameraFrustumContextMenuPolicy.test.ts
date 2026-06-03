import { describe, expect, it } from 'vitest';
import type { CameraViewState, NavigationHistoryEntry } from '../../store/types';
import {
  getArrowContextMenuAction,
  getGotoContextMenuAction,
} from './cameraFrustumContextMenuPolicy';

describe('camera frustum context-menu policy', () => {
  it('plans arrow right-click actions from selection, matches, and navigation history', () => {
    const selectedImageId = 10;
    const targetImageId = 20;
    const lastEntry: NavigationHistoryEntry = {
      fromState: buildViewState(0),
      fromImageId: null,
      toImageId: selectedImageId,
    };

    expect(getArrowContextMenuAction({
      frustumExists: false,
      imageId: targetImageId,
      selectedImageId,
      matchedImageIds: new Set(),
      lastEntry: null,
      canReadCurrentViewState: true,
    })).toBe('none');

    expect(getArrowContextMenuAction({
      frustumExists: true,
      imageId: selectedImageId,
      selectedImageId,
      matchedImageIds: new Set(),
      lastEntry,
      canReadCurrentViewState: false,
    })).toBe('goBack');

    expect(getArrowContextMenuAction({
      frustumExists: true,
      imageId: selectedImageId,
      selectedImageId,
      matchedImageIds: new Set(),
      lastEntry: null,
      canReadCurrentViewState: false,
    })).toBe('deselect');

    expect(getArrowContextMenuAction({
      frustumExists: true,
      imageId: targetImageId,
      selectedImageId,
      matchedImageIds: new Set([targetImageId]),
      lastEntry: null,
      canReadCurrentViewState: true,
    })).toBe('openMatchedDetail');

    expect(getArrowContextMenuAction({
      frustumExists: true,
      imageId: targetImageId,
      selectedImageId: null,
      matchedImageIds: new Set(),
      lastEntry: { ...lastEntry, toImageId: targetImageId },
      canReadCurrentViewState: true,
    })).toBe('goBack');

    expect(getArrowContextMenuAction({
      frustumExists: true,
      imageId: targetImageId,
      selectedImageId: null,
      matchedImageIds: new Set(),
      lastEntry: { ...lastEntry, toImageId: targetImageId },
      canReadCurrentViewState: false,
    })).toBe('flyToImage');
  });

  it('plans explicit context-menu goto history behavior', () => {
    const targetImageId = 20;
    const lastEntry: NavigationHistoryEntry = {
      fromState: buildViewState(0),
      fromImageId: 10,
      toImageId: targetImageId,
    };

    expect(getGotoContextMenuAction({
      targetImageId,
      lastEntry,
      canReadCurrentViewState: false,
    })).toBe('flyWithoutHistory');

    expect(getGotoContextMenuAction({
      targetImageId,
      lastEntry,
      canReadCurrentViewState: true,
    })).toBe('goBack');

    expect(getGotoContextMenuAction({
      targetImageId,
      lastEntry: { ...lastEntry, toImageId: 30 },
      canReadCurrentViewState: true,
    })).toBe('pushAndFly');
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
