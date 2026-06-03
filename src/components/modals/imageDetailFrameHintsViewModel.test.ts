import { describe, expect, it } from 'vitest';
import { getImageDetailFrameHintState } from './imageDetailFrameHintsViewModel';
import type { MaskMode } from './imageDetailMaskViewModel';

describe('imageDetailFrameHintsViewModel', () => {
  it('uses matched images as the scroll target only when matches are visible and available', () => {
    expect(getImageDetailFrameHintState({
      showMatchesInModal: true,
      connectedImageCount: 2,
      hasMask: false,
      maskSrc: null,
      maskMode: 'hover',
    }).scrollTargetLabel).toBe('matched images');

    expect(getImageDetailFrameHintState({
      showMatchesInModal: true,
      connectedImageCount: 0,
      hasMask: false,
      maskSrc: null,
      maskMode: 'hover',
    }).scrollTargetLabel).toBe('images');

    expect(getImageDetailFrameHintState({
      showMatchesInModal: false,
      connectedImageCount: 2,
      hasMask: false,
      maskSrc: null,
      maskMode: 'hover',
    }).scrollTargetLabel).toBe('images');
  });

  it('shows mask cycle hints only for image view masks with a loaded source', () => {
    expect(getImageDetailFrameHintState({
      showMatchesInModal: false,
      connectedImageCount: 0,
      hasMask: true,
      maskSrc: 'mask.png',
      maskMode: 'hover',
    }).maskCycleHint).toEqual({
      currentMode: 'hover',
      nextMode: 'mask',
    });

    expect(getImageDetailFrameHintState({
      showMatchesInModal: true,
      connectedImageCount: 1,
      hasMask: true,
      maskSrc: 'mask.png',
      maskMode: 'hover',
    }).maskCycleHint).toBeNull();

    expect(getImageDetailFrameHintState({
      showMatchesInModal: false,
      connectedImageCount: 0,
      hasMask: true,
      maskSrc: null,
      maskMode: 'hover',
    }).maskCycleHint).toBeNull();

    expect(getImageDetailFrameHintState({
      showMatchesInModal: false,
      connectedImageCount: 0,
      hasMask: false,
      maskSrc: 'mask.png',
      maskMode: 'hover',
    }).maskCycleHint).toBeNull();
  });

  it('uses the shared mask mode cycle for hint labels', () => {
    const expectedNextModes: Record<MaskMode, MaskMode> = {
      hover: 'mask',
      mask: 'split',
      split: 'image',
      image: 'hover',
    };

    for (const [maskMode, nextMode] of Object.entries(expectedNextModes) as Array<[MaskMode, MaskMode]>) {
      expect(getImageDetailFrameHintState({
        showMatchesInModal: false,
        connectedImageCount: 0,
        hasMask: true,
        maskSrc: 'mask.png',
        maskMode,
      }).maskCycleHint).toEqual({
        currentMode: maskMode,
        nextMode,
      });
    }
  });
});
