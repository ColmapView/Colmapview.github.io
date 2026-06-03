import { describe, expect, it } from 'vitest';
import {
  buildConnectedImages,
  buildImageNavigation,
  buildMatchLines,
  getCurrentMatchCount,
  getEffectivePoints2D,
  getPointCounts,
} from './imageDetailViewModel';
import {
  areAllMarkedForDeletion,
  getCameraImageIds,
  getFrameImageIds,
} from './imageDetailDeletionViewModel';
import {
  clampPositionToViewport,
  fitSideBySideDimensions,
  fitSingleImageDimensions,
  fitVerticalStackedDimensions,
  getInitialImageModalBounds,
  getSideBySideMatchLayout,
  getSingleImageLayout,
  getVerticalStackedMatchLayout,
  resizeModalBounds,
} from './imageDetailLayoutViewModel';
import {
  getActiveMaskViewState,
  getMaskSplitViewState,
  getNextMaskViewState,
  getResetMaskViewState,
} from './imageDetailMaskViewModel';
import {
  applyOpacityInputValue,
  getOpacityInputKeyAction,
  getOpacityInputValue,
  getWheelAdjustedOpacity,
} from './imageDetailOpacityViewModel';
import {
  getImageNamesToFetch,
  getMaskNameToFetch,
} from './imageDetailFileViewModel';
import {
  applyLazyPointCacheUpdate,
  getLazyImagePointLoadIds,
} from './imageDetailLazyPointsViewModel';
import {
  getCycledMatchedImageId,
  getImageDetailNavigationButtonState,
  getImageTouchGesture,
  getImageTouchNavigationAction,
  getImageWheelNavigationPlan,
  shouldPreventTouchScroll,
} from './imageDetailNavigationViewModel';
import {
  buildCamera,
  buildImage,
  buildImageStats,
  buildPoint2D,
  buildReconstruction,
} from '../../test/builders';
import { UNMATCHED_POINT3D_ID } from '../../types/colmap';
import { SensorType, type RigData } from '../../types/rig';

describe('ImageDetailModal view-model helpers', () => {
  it('derives camera and rig-frame deletion groups', () => {
    const cameraA = buildCamera({ cameraId: 1 });
    const cameraB = buildCamera({ cameraId: 2 });
    const imageA1 = buildImage({ imageId: 1, cameraId: cameraA.cameraId, name: 'a1.jpg' });
    const imageA2 = buildImage({ imageId: 2, cameraId: cameraA.cameraId, name: 'a2.jpg' });
    const imageB1 = buildImage({ imageId: 3, cameraId: cameraB.cameraId, name: 'b1.jpg' });
    const rigData: RigData = {
      rigs: new Map(),
      frames: new Map([[
        10,
        {
          frameId: 10,
          rigId: 1,
          rigFromWorld: { qvec: [1, 0, 0, 0], tvec: [0, 0, 0] },
          dataIds: [
            { sensorId: { type: SensorType.CAMERA, id: 1 }, dataId: imageA1.imageId },
            { sensorId: { type: SensorType.CAMERA, id: 2 }, dataId: imageB1.imageId },
            { sensorId: { type: SensorType.CAMERA, id: 3 }, dataId: 99 },
          ],
        },
      ]]),
    };
    const reconstruction = {
      ...buildReconstruction({
        cameras: [cameraA, cameraB],
        images: [imageA1, imageA2, imageB1],
      }),
      rigData,
    };

    expect(getCameraImageIds(reconstruction, imageA1.imageId)).toEqual([imageA1.imageId, imageA2.imageId]);
    expect(getFrameImageIds(reconstruction, imageA1.imageId)).toEqual([imageA1.imageId, imageB1.imageId]);
    expect(areAllMarkedForDeletion([imageA1.imageId, imageB1.imageId], new Set([imageA1.imageId]))).toBe(false);
    expect(areAllMarkedForDeletion([imageA1.imageId, imageB1.imageId], new Set([imageA1.imageId, imageB1.imageId]))).toBe(true);
  });

  it('builds navigation, counts, and connected image options', () => {
    const selected = buildImage({ imageId: 20, name: 'selected.jpg', numPoints2D: 12 });
    const previous = buildImage({ imageId: 10, name: 'previous.jpg' });
    const next = buildImage({ imageId: 30, name: 'next.jpg' });
    const reconstruction = buildReconstruction({
      images: [selected, previous, next],
      imageStats: new Map([[selected.imageId, buildImageStats({ numPoints3D: 5 })]]),
      connectedImagesIndex: new Map([[
        selected.imageId,
        new Map([
          [previous.imageId, 3],
          [next.imageId, 9],
        ]),
      ]]),
    });

    expect(buildImageNavigation(reconstruction, selected.imageId)).toMatchObject({
      imageIds: [previous.imageId, selected.imageId, next.imageId],
      currentIndex: 1,
      hasPrev: true,
      hasNext: true,
      prevImageId: previous.imageId,
      nextImageId: next.imageId,
    });
    expect(getPointCounts(reconstruction, selected, selected.imageId)).toEqual({
      numPoints2D: 12,
      numPoints3D: 5,
    });

    const connectedImages = buildConnectedImages(reconstruction, selected.imageId, new Set([next.imageId]));
    expect(connectedImages).toEqual([
      { imageId: previous.imageId, matchCount: 3, name: previous.name },
    ]);
    expect(getCurrentMatchCount(connectedImages, previous.imageId)).toBe(3);
    expect(getCurrentMatchCount(connectedImages, next.imageId)).toBe(0);
  });

  it('uses lazy keypoints and builds match lines by shared 3D point id', () => {
    const currentPoints = [
      buildPoint2D({ xy: [1, 2], point3DId: 1n }),
      buildPoint2D({ xy: [3, 4], point3DId: 2n }),
      buildPoint2D({ xy: [5, 6], point3DId: UNMATCHED_POINT3D_ID }),
    ];
    const matchedPoints = [
      buildPoint2D({ xy: [30, 40], point3DId: 2n }),
      buildPoint2D({ xy: [90, 100], point3DId: 9n }),
    ];
    const liteImage = buildImage({ imageId: 1, points2D: [] });
    const eagerImage = buildImage({ imageId: 2, points2D: matchedPoints });
    const lazyPoints = new Map([[liteImage.imageId, currentPoints]]);

    expect(getEffectivePoints2D(liteImage, lazyPoints)).toBe(currentPoints);
    expect(getEffectivePoints2D(eagerImage, lazyPoints)).toBe(matchedPoints);
    expect(buildMatchLines(false, currentPoints, matchedPoints)).toEqual([]);
    expect(buildMatchLines(true, currentPoints, matchedPoints)).toEqual([
      { point1: [3, 4], point2: [30, 40] },
    ]);
  });

  it('plans and applies lazy WASM point loading with LRU eviction', () => {
    const currentPoints = [buildPoint2D({ xy: [1, 2], point3DId: 1n })];
    const matchedPoints = [buildPoint2D({ xy: [3, 4], point3DId: 2n })];
    const current = buildImage({ imageId: 1, points2D: [], numPoints2D: 10 });
    const matched = buildImage({ imageId: 2, points2D: [], numPoints2D: 5 });
    const eager = buildImage({ imageId: 3, points2D: currentPoints, numPoints2D: 1 });
    const empty = buildImage({ imageId: 4, points2D: [], numPoints2D: 0 });
    const reconstruction = buildReconstruction({ images: [current, matched, eager, empty] });

    expect(getLazyImagePointLoadIds({
      reconstruction,
      imageDetailId: current.imageId,
      matchedImageId: matched.imageId,
      showPoints2D: false,
      showPoints3D: false,
      showMatchesInModal: true,
      lazyPoints2D: new Map(),
    })).toEqual([current.imageId, matched.imageId]);

    expect(getLazyImagePointLoadIds({
      reconstruction,
      imageDetailId: eager.imageId,
      matchedImageId: empty.imageId,
      showPoints2D: true,
      showPoints3D: false,
      showMatchesInModal: true,
      lazyPoints2D: new Map([[matched.imageId, matchedPoints]]),
    })).toEqual([]);

    const cache = applyLazyPointCacheUpdate({
      currentPoints: new Map([[9, [buildPoint2D({ xy: [9, 9], point3DId: 9n })]]]),
      currentLoadOrder: [9],
      loadedPoints: new Map([
        [current.imageId, currentPoints],
        [matched.imageId, matchedPoints],
        [empty.imageId, []],
      ]),
      maxCacheSize: 2,
    });

    expect(cache.loadOrder).toEqual([current.imageId, matched.imageId]);
    expect(cache.points.has(9)).toBe(false);
    expect(cache.points.get(current.imageId)).toBe(currentPoints);
    expect(cache.points.get(matched.imageId)).toBe(matchedPoints);
    expect(cache.points.has(empty.imageId)).toBe(false);
  });

  it('plans async image and mask fetches from uncached dataset resources', () => {
    const selected = buildImage({ imageId: 1, name: 'selected.jpg' });
    const matched = buildImage({ imageId: 2, name: 'matched.jpg' });
    const duplicateName = buildImage({ imageId: 3, name: 'selected.jpg' });
    const reconstruction = buildReconstruction({ images: [selected, matched, duplicateName] });
    const cachedNames = new Set([matched.name]);

    expect(getImageNamesToFetch({
      reconstruction,
      imageDetailId: selected.imageId,
      matchedImageId: matched.imageId,
      hasImages: true,
      isImageCached: (name) => cachedNames.has(name),
    })).toEqual([selected.name]);

    expect(getImageNamesToFetch({
      reconstruction,
      imageDetailId: selected.imageId,
      matchedImageId: duplicateName.imageId,
      hasImages: true,
      isImageCached: () => false,
    })).toEqual([selected.name]);

    expect(getImageNamesToFetch({
      reconstruction,
      imageDetailId: selected.imageId,
      matchedImageId: matched.imageId,
      hasImages: false,
      isImageCached: () => false,
    })).toEqual([]);

    expect(getMaskNameToFetch({
      reconstruction,
      imageDetailId: selected.imageId,
      hasMasks: true,
      isMaskCached: () => false,
    })).toBe(selected.name);
    expect(getMaskNameToFetch({
      reconstruction,
      imageDetailId: selected.imageId,
      hasMasks: true,
      isMaskCached: () => true,
    })).toBeNull();
    expect(getMaskNameToFetch({
      reconstruction,
      imageDetailId: selected.imageId,
      hasMasks: false,
      isMaskCached: () => false,
    })).toBeNull();
  });

  it('fits single and match-view image dimensions within their containers', () => {
    const wide = buildCamera({ width: 800, height: 400 });
    const tall = buildCamera({ cameraId: 2, width: 400, height: 800 });
    const emptyMatchDimensions = {
      image1Width: 0,
      image1Height: 0,
      image2Width: 0,
      image2Height: 0,
    };

    expect(fitSingleImageDimensions(wide, { width: 400, height: 400 })).toEqual({
      renderedImageWidth: 400,
      renderedImageHeight: 200,
    });
    expect(fitSingleImageDimensions(tall, { width: 400, height: 400 })).toEqual({
      renderedImageWidth: 200,
      renderedImageHeight: 400,
    });
    expect(fitSideBySideDimensions(wide, tall, { width: 820, height: 400 }, 20)).toEqual({
      image1Width: 400,
      image1Height: 200,
      image2Width: 200,
      image2Height: 400,
    });
    expect(fitVerticalStackedDimensions(wide, tall, { width: 400, height: 820 }, 20)).toEqual({
      image1Width: 400,
      image1Height: 200,
      image2Width: 200,
      image2Height: 400,
    });
    expect(fitSideBySideDimensions(wide, tall, { width: 20, height: 400 }, 20)).toEqual(emptyMatchDimensions);
    expect(fitVerticalStackedDimensions(wide, tall, { width: 400, height: 20 }, 20)).toEqual(emptyMatchDimensions);
  });

  it('derives image placements and scales for overlays', () => {
    const wide = buildCamera({ width: 800, height: 400 });
    const tall = buildCamera({ cameraId: 2, width: 400, height: 800 });

    expect(getSingleImageLayout(wide, { width: 400, height: 400 })).toEqual({
      width: 400,
      height: 200,
      renderedImageWidth: 400,
      renderedImageHeight: 200,
      offsetX: 0,
      offsetY: 100,
      scaleX: 0.5,
      scaleY: 0.5,
    });

    expect(getSideBySideMatchLayout(wide, tall, { width: 820, height: 400 }, 20)).toEqual({
      image1: { width: 400, height: 200, offsetX: 0, offsetY: 100, scaleX: 0.5, scaleY: 0.5 },
      image2: { width: 200, height: 400, offsetX: 520, offsetY: 0, scaleX: 0.5, scaleY: 0.5 },
    });

    expect(getVerticalStackedMatchLayout(wide, tall, { width: 400, height: 820 }, 20)).toEqual({
      image1: { width: 400, height: 200, offsetX: 0, offsetY: 100, scaleX: 0.5, scaleY: 0.5 },
      image2: { width: 200, height: 400, offsetX: 100, offsetY: 420, scaleX: 0.5, scaleY: 0.5 },
    });

    expect(getSideBySideMatchLayout(null, tall, { width: 820, height: 400 }, 20)).toEqual({
      image1: { width: 0, height: 0, offsetX: 0, offsetY: 0, scaleX: 0, scaleY: 0 },
      image2: { width: 0, height: 0, offsetX: 0, offsetY: 0, scaleX: 0, scaleY: 0 },
    });
  });

  it('derives initial modal bounds from camera and viewport dimensions', () => {
    const camera = buildCamera({ width: 1600, height: 800 });

    expect(getInitialImageModalBounds(camera, { width: 1000, height: 800 }, {
      minWidth: 300,
      minHeight: 200,
      maxWidthPercent: 0.9,
      maxHeightPercent: 0.85,
      headerHeight: 40,
      footerHeight: 50,
      padding: 20,
    })).toEqual({
      size: { width: 900, height: 550 },
      position: { x: 50, y: 125 },
    });

    expect(getInitialImageModalBounds(camera, { width: 320, height: 240 }, {
      minWidth: 300,
      minHeight: 200,
      maxWidthPercent: 0.9,
      maxHeightPercent: 0.85,
      headerHeight: 40,
      footerHeight: 50,
      padding: 20,
    })).toEqual({
      size: { width: 300, height: 204 },
      position: { x: 10, y: 18 },
    });
  });

  it('derives resize-handle modal bounds and viewport clamping', () => {
    expect(resizeModalBounds({
      startPointer: { x: 100, y: 100 },
      currentPointer: { x: 150, y: 175 },
      startSize: { width: 400, height: 300 },
      startPosition: { x: 20, y: 30 },
      direction: 'se',
      minWidth: 300,
      minHeight: 200,
    })).toEqual({
      size: { width: 450, height: 375 },
      position: { x: 20, y: 30 },
    });

    expect(resizeModalBounds({
      startPointer: { x: 100, y: 100 },
      currentPointer: { x: 150, y: 175 },
      startSize: { width: 400, height: 300 },
      startPosition: { x: 20, y: 30 },
      direction: 'nw',
      minWidth: 300,
      minHeight: 200,
    })).toEqual({
      size: { width: 350, height: 225 },
      position: { x: 70, y: 105 },
    });

    expect(resizeModalBounds({
      startPointer: { x: 100, y: 100 },
      currentPointer: { x: 250, y: 250 },
      startSize: { width: 400, height: 300 },
      startPosition: { x: 20, y: 30 },
      direction: 'nw',
      minWidth: 300,
      minHeight: 200,
    })).toEqual({
      size: { width: 400, height: 300 },
      position: { x: 20, y: 30 },
    });

    expect(clampPositionToViewport(
      { x: 850, y: -20 },
      { width: 300, height: 250 },
      { width: 1000, height: 800 }
    )).toEqual({ x: 700, y: 0 });
  });

  it('classifies image modal touch gestures', () => {
    const start = { x: 100, y: 100, time: 1_000 };

    expect(shouldPreventTouchScroll(start, { x: 105, y: 108 })).toBe(false);
    expect(shouldPreventTouchScroll(start, { x: 112, y: 108 })).toBe(true);

    expect(getImageTouchGesture(start, { x: 108, y: 109 }, 1_200, false)).toBe('tap');
    expect(getImageTouchGesture(start, { x: 20, y: 110 }, 1_500, false)).toBe('nextImage');
    expect(getImageTouchGesture(start, { x: 180, y: 90 }, 1_500, false)).toBe('previousImage');
    expect(getImageTouchGesture(start, { x: 110, y: 20 }, 1_500, true)).toBe('nextMatch');
    expect(getImageTouchGesture(start, { x: 110, y: 180 }, 1_500, true)).toBe('previousMatch');
    expect(getImageTouchGesture(start, { x: 110, y: 20 }, 1_500, false)).toBeNull();
    expect(getImageTouchGesture(start, { x: 140, y: 130 }, 1_500, true)).toBeNull();
  });

  it('plans image modal touch and wheel navigation actions', () => {
    const connectedImages = [
      { imageId: 10, matchCount: 8, name: 'a.jpg' },
      { imageId: 20, matchCount: 5, name: 'b.jpg' },
      { imageId: 30, matchCount: 2, name: 'c.jpg' },
    ];

    expect(getCycledMatchedImageId(connectedImages, null, 1)).toBe(10);
    expect(getCycledMatchedImageId(connectedImages, 20, 1)).toBe(30);
    expect(getCycledMatchedImageId(connectedImages, 20, -1)).toBe(10);
    expect(getCycledMatchedImageId(connectedImages, 30, 1)).toBe(30);
    expect(getCycledMatchedImageId([], 30, 1)).toBeNull();

    expect(getImageTouchNavigationAction({
      gesture: 'tap',
      hasMask: true,
      hasMaskSrc: true,
      isMarkedForDeletion: false,
      showMatchesInModal: false,
    })).toEqual({ type: 'cycleMask' });
    expect(getImageTouchNavigationAction({
      gesture: 'tap',
      hasMask: true,
      hasMaskSrc: true,
      isMarkedForDeletion: false,
      showMatchesInModal: true,
    })).toBeNull();
    expect(getImageTouchNavigationAction({
      gesture: 'nextMatch',
      hasMask: false,
      hasMaskSrc: false,
      isMarkedForDeletion: false,
      showMatchesInModal: true,
    })).toEqual({ type: 'match', direction: 1 });

    expect(getImageWheelNavigationPlan({
      deltaY: 100,
      now: 1_050,
      lastWheelTime: 1_000,
      throttleMs: 100,
      showMatchesInModal: false,
      hasConnectedImages: false,
    })).toEqual({ action: null, nextLastWheelTime: 1_000 });
    expect(getImageWheelNavigationPlan({
      deltaY: 100,
      now: 1_150,
      lastWheelTime: 1_000,
      throttleMs: 100,
      showMatchesInModal: false,
      hasConnectedImages: false,
    })).toEqual({ action: { type: 'image', direction: 1 }, nextLastWheelTime: 1_150 });
    expect(getImageWheelNavigationPlan({
      deltaY: -100,
      now: 1_150,
      lastWheelTime: 1_000,
      throttleMs: 100,
      showMatchesInModal: true,
      hasConnectedImages: true,
    })).toEqual({ action: { type: 'match', direction: -1 }, nextLastWheelTime: 1_150 });
  });

  it('derives image navigation button state for touch and desktop controls', () => {
    expect(getImageDetailNavigationButtonState({
      direction: 'previous',
      variant: 'touch',
      hasTarget: true,
    })).toEqual({
      label: '← Prev',
      disabled: false,
      className: 'flex-1 px-2 flex items-center justify-center rounded-md text-xs bg-ds-hover text-ds-primary',
    });

    expect(getImageDetailNavigationButtonState({
      direction: 'next',
      variant: 'touch',
      hasTarget: false,
    })).toEqual({
      label: 'Next →',
      disabled: true,
      className: 'flex-1 px-2 flex items-center justify-center rounded-md text-xs bg-ds-secondary text-ds-muted',
    });

    const desktopPrevious = getImageDetailNavigationButtonState({
      direction: 'previous',
      variant: 'desktop',
      hasTarget: true,
    });
    expect(desktopPrevious.label).toBe('← Prev');
    expect(desktopPrevious.disabled).toBe(false);
    expect(desktopPrevious.className).toContain('px-4 py-1 text-xs gap-1');
    expect(desktopPrevious.className).toContain('bg-ds-hover text-ds-secondary');

    const desktopNext = getImageDetailNavigationButtonState({
      direction: 'next',
      variant: 'desktop',
      hasTarget: false,
    });
    expect(desktopNext.label).toBe('Next →');
    expect(desktopNext.disabled).toBe(true);
    expect(desktopNext.className).toContain('opacity-50 cursor-not-allowed');
    expect(desktopNext.className).toContain('bg-ds-secondary text-ds-muted');
  });

  it('derives image mask display state', () => {
    const initial = { imageDetailId: null, mode: 'hover' as const, splitX: 0.5 };
    const imageId = 42;

    expect(getActiveMaskViewState(initial, imageId)).toEqual({ mode: 'hover', splitX: 0.5 });

    const mask = getNextMaskViewState(initial, imageId);
    expect(mask).toEqual({ imageDetailId: imageId, mode: 'mask', splitX: 0.5 });
    expect(getNextMaskViewState(mask, imageId)).toEqual({ imageDetailId: imageId, mode: 'split', splitX: 0.5 });
    expect(getNextMaskViewState({ imageDetailId: imageId, mode: 'image', splitX: 0.25 }, imageId)).toEqual({
      imageDetailId: imageId,
      mode: 'hover',
      splitX: 0.25,
    });

    expect(getMaskSplitViewState(mask, imageId, 1.5)).toEqual({
      imageDetailId: imageId,
      mode: 'mask',
      splitX: 1,
    });
    expect(getMaskSplitViewState(mask, 99, -0.2)).toEqual({
      imageDetailId: 99,
      mode: 'hover',
      splitX: 0,
    });
    expect(getResetMaskViewState({ imageDetailId: imageId, mode: 'split', splitX: 0.7 }, imageId)).toEqual({
      imageDetailId: imageId,
      mode: 'hover',
      splitX: 0.7,
    });
    expect(getResetMaskViewState({ imageDetailId: imageId, mode: 'split', splitX: 0.7 }, 99)).toEqual({
      imageDetailId: 99,
      mode: 'hover',
      splitX: 0.5,
    });
  });

  it('derives match-line opacity edit values', () => {
    expect(getOpacityInputValue(0.354)).toBe('35');
    expect(applyOpacityInputValue('75', 0.2)).toEqual({ opacity: 0.75, applied: true });
    expect(applyOpacityInputValue('-10', 0.2)).toEqual({ opacity: 0, applied: true });
    expect(applyOpacityInputValue('150', 0.2)).toEqual({ opacity: 1, applied: true });
    expect(applyOpacityInputValue('75px', 0.42)).toEqual({ opacity: 0.42, applied: false });
    expect(applyOpacityInputValue('not a number', 0.42)).toEqual({ opacity: 0.42, applied: false });

    expect(getWheelAdjustedOpacity(0.5, 120)).toBe(0.45);
    expect(getWheelAdjustedOpacity(0.5, -120)).toBe(0.55);
    expect(getWheelAdjustedOpacity(0.98, -120)).toBe(1);
    expect(getWheelAdjustedOpacity(0.02, 120)).toBe(0);
    expect(getOpacityInputKeyAction('Enter')).toBe('apply');
    expect(getOpacityInputKeyAction('Escape')).toBe('cancel');
    expect(getOpacityInputKeyAction('Tab')).toBe('none');
  });
});
