import { describe, expect, it } from 'vitest';
import { getSingleImageViewRenderState } from './imageDetailSingleImageViewModel';
import type { SingleImageLayout } from './imageDetailLayoutViewModel';

describe('imageDetailSingleImageViewModel', () => {
  it('derives mask interaction and hover mask styles for an active image', () => {
    const state = getSingleImageViewRenderState({
      layout: buildLayout(),
      isMarkedForDeletion: false,
      showPoints2D: true,
      showPoints3D: false,
      pointCount: 3,
      maskMode: 'hover',
      splitX: 0.25,
      maskEnabled: true,
      hasMaskSrc: true,
    });

    expect(state.canShowRenderedArea).toBe(true);
    expect(state.canShowMask).toBe(true);
    expect(state.containerStyle).toEqual({ cursor: 'pointer' });
    expect(state.imageStyle).toMatchObject({
      width: 320,
      height: 240,
      left: 10,
      top: 20,
      opacity: 1,
    });
    expect(state.maskClassName).toContain('group-hover:opacity-50');
    expect(state.maskStyle).not.toHaveProperty('opacity');
    expect(state.showDeletedOverlay).toBe(false);
    expect(state.showKeypoints).toBe(true);
  });

  it('derives split image and mask clipping from the shared split position', () => {
    const state = getSingleImageViewRenderState({
      layout: buildLayout(),
      isMarkedForDeletion: false,
      showPoints2D: false,
      showPoints3D: false,
      pointCount: 0,
      maskMode: 'split',
      splitX: 0.25,
      maskEnabled: true,
      hasMaskSrc: true,
    });

    expect(state.imageStyle).toMatchObject({
      clipPath: 'inset(0 75% 0 0)',
    });
    expect(state.maskStyle).toMatchObject({
      opacity: 1,
      clipPath: 'inset(0 0 0 25%)',
    });
    expect(state.showKeypoints).toBe(false);
  });

  it('hides mask interaction and keypoints for deleted images', () => {
    const state = getSingleImageViewRenderState({
      layout: buildLayout(),
      isMarkedForDeletion: true,
      showPoints2D: true,
      showPoints3D: true,
      pointCount: 3,
      maskMode: 'mask',
      splitX: 0.5,
      maskEnabled: true,
      hasMaskSrc: true,
    });

    expect(state.canShowMask).toBe(false);
    expect(state.containerStyle).toEqual({ cursor: undefined });
    expect(state.imageStyle).toMatchObject({
      opacity: 0,
      filter: 'grayscale(100%)',
    });
    expect(state.showDeletedOverlay).toBe(true);
    expect(state.showKeypoints).toBe(false);
  });

  it('does not render image overlays when there is no renderable image area', () => {
    const state = getSingleImageViewRenderState({
      layout: buildLayout({ renderedImageWidth: 0 }),
      isMarkedForDeletion: true,
      showPoints2D: true,
      showPoints3D: false,
      pointCount: 3,
      maskMode: 'image',
      splitX: 0.5,
      maskEnabled: true,
      hasMaskSrc: true,
    });

    expect(state.canShowRenderedArea).toBe(false);
    expect(state.showDeletedOverlay).toBe(false);
    expect(state.showKeypoints).toBe(false);
    expect(state.maskStyle).toMatchObject({ opacity: 0 });
  });
});

function buildLayout(overrides: Partial<SingleImageLayout> = {}): SingleImageLayout {
  return {
    width: 320,
    height: 240,
    renderedImageWidth: 320,
    renderedImageHeight: 240,
    offsetX: 10,
    offsetY: 20,
    scaleX: 0.5,
    scaleY: 0.5,
    ...overrides,
  };
}
