import { describe, expect, it } from 'vitest';
import { getMatchImagePairRenderState } from './imageDetailMatchImagePairViewModel';
import type { MatchViewLayout } from './imageDetailLayoutViewModel';

describe('imageDetailMatchImagePairViewModel', () => {
  it('renders loaded primary and matched images when both sources are available', () => {
    const state = getMatchImagePairRenderState({
      layout: buildMatchLayout(),
      hasImageSrc: true,
      hasMatchedImageSrc: true,
      hasMatchedCamera: true,
      matchLineCount: 2,
    });

    expect(state.primaryImage).toMatchObject({
      canRender: true,
      showImage: true,
      showPlaceholder: false,
      imageStyle: { width: 300, height: 220, left: 10, top: 20 },
      placeholderStyle: { position: 'absolute', left: 10, top: 20 },
    });
    expect(state.matchedImage).toMatchObject({
      canRender: true,
      showImage: true,
      showPlaceholder: false,
      imageStyle: { width: 280, height: 210, left: 330, top: 25 },
    });
    expect(state.showMatchLines).toBe(true);
  });

  it('falls back to placeholders when sources are missing but placements are renderable', () => {
    const state = getMatchImagePairRenderState({
      layout: buildMatchLayout(),
      hasImageSrc: false,
      hasMatchedImageSrc: false,
      hasMatchedCamera: true,
      matchLineCount: 0,
    });

    expect(state.primaryImage.showPlaceholder).toBe(true);
    expect(state.matchedImage.showPlaceholder).toBe(true);
    expect(state.showMatchLines).toBe(false);
  });

  it('hides the matched side without a matched camera but preserves match-line layout policy', () => {
    const state = getMatchImagePairRenderState({
      layout: buildMatchLayout(),
      hasImageSrc: true,
      hasMatchedImageSrc: true,
      hasMatchedCamera: false,
      matchLineCount: 1,
    });

    expect(state.primaryImage.showImage).toBe(true);
    expect(state.matchedImage).toMatchObject({
      canRender: false,
      showImage: false,
      showPlaceholder: false,
    });
    expect(state.showMatchLines).toBe(true);
  });

  it('does not render image surfaces or match lines for empty placements', () => {
    const state = getMatchImagePairRenderState({
      layout: buildMatchLayout({
        image1: { width: 0, height: 0, offsetX: 0, offsetY: 0, scaleX: 0, scaleY: 0 },
      }),
      hasImageSrc: true,
      hasMatchedImageSrc: true,
      hasMatchedCamera: true,
      matchLineCount: 2,
    });

    expect(state.primaryImage.canRender).toBe(false);
    expect(state.primaryImage.showImage).toBe(false);
    expect(state.showMatchLines).toBe(false);
  });
});

function buildMatchLayout(overrides: Partial<MatchViewLayout> = {}): MatchViewLayout {
  return {
    image1: { width: 300, height: 220, offsetX: 10, offsetY: 20, scaleX: 0.5, scaleY: 0.5 },
    image2: { width: 280, height: 210, offsetX: 330, offsetY: 25, scaleX: 0.5, scaleY: 0.5 },
    ...overrides,
  };
}
