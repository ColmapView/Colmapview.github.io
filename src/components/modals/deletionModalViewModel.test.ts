import { describe, expect, it } from 'vitest';
import {
  buildDeletionCameraGroups,
  buildDeletionFrameGroups,
  buildPendingDeletionItems,
  DELETION_MODAL_ESTIMATED_HEIGHT,
  DELETION_MODAL_ESTIMATED_WIDTH,
  getApplyDeletionLabel,
  getDeletionBulkAddButtonState,
  getDeletionCameraSelectOptions,
  getDeletionFrameSelectOptions,
  getDeletionItemLabel,
  getDeletionApplyButtonStyle,
  getDeletionModalHeaderDragStyle,
  getDeletionModalOverlayStyle,
  getDeletionModalPanelStyle,
  getDeletionPaginationButtonState,
  getDeletionThumbnailImageStyle,
  getMarkedForDeletionLabel,
  getNextDeletionPage,
  getPaginatedDeletionItems,
  getPreviousDeletionPage,
  getSelectedCameraGroupImageIds,
  getSelectedFrameGroupImageIds,
  hasMultipleDeletionCameras,
  shouldShowDeletionPagination,
} from './deletionModalViewModel';
import {
  buildCamera,
  buildFile,
  buildImage,
  buildReconstruction,
} from '../../test/builders';
import { SensorType, type RigData } from '../../types/rig';
import { DELETED_FILTER } from '../../theme';

describe('DeletionModal view-model helpers', () => {
  it('builds sorted camera and rig-frame bulk deletion groups', () => {
    const cameraA = buildCamera({ cameraId: 1, width: 640, height: 480 });
    const cameraB = buildCamera({ cameraId: 2, width: 800, height: 600 });
    const imageB = buildImage({ imageId: 30, cameraId: cameraB.cameraId, name: 'b.jpg' });
    const imageA1 = buildImage({ imageId: 10, cameraId: cameraA.cameraId, name: 'a1.jpg' });
    const imageA2 = buildImage({ imageId: 20, cameraId: cameraA.cameraId, name: 'a2.jpg' });
    const rigData: RigData = {
      rigs: new Map(),
      frames: new Map([
        [20, {
          frameId: 20,
          rigId: 1,
          rigFromWorld: { qvec: [1, 0, 0, 0], tvec: [0, 0, 0] },
          dataIds: [
            { sensorId: { type: SensorType.IMU, id: 1 }, dataId: 999 },
            { sensorId: { type: SensorType.CAMERA, id: cameraA.cameraId }, dataId: imageA2.imageId },
          ],
        }],
        [10, {
          frameId: 10,
          rigId: 1,
          rigFromWorld: { qvec: [1, 0, 0, 0], tvec: [0, 0, 0] },
          dataIds: [
            { sensorId: { type: SensorType.CAMERA, id: cameraB.cameraId }, dataId: imageB.imageId },
            { sensorId: { type: SensorType.CAMERA, id: 99 }, dataId: 99 },
          ],
        }],
      ]),
    };
    const reconstruction = {
      ...buildReconstruction({
        cameras: [cameraB, cameraA],
        images: [imageB, imageA1, imageA2],
      }),
      rigData,
    };

    expect(buildDeletionCameraGroups(reconstruction)).toEqual([
      {
        cameraId: cameraA.cameraId,
        label: 'Camera 1: Pinhole 640x480 (2 imgs)',
        imageIds: [imageA1.imageId, imageA2.imageId],
      },
      {
        cameraId: cameraB.cameraId,
        label: 'Camera 2: Pinhole 800x600 (1 img)',
        imageIds: [imageB.imageId],
      },
    ]);
    expect(buildDeletionFrameGroups(reconstruction)).toEqual([
      { frameId: 10, label: 'Frame 10 (1 img)', imageIds: [imageB.imageId] },
      { frameId: 20, label: 'Frame 20 (1 img)', imageIds: [imageA2.imageId] },
    ]);
  });

  it('builds sorted pending deletion items with files and fallback names', () => {
    const imageA = buildImage({ imageId: 10, cameraId: 1, name: 'a.jpg' });
    const imageB = buildImage({ imageId: 20, cameraId: 2, name: 'b.jpg' });
    const fileA = buildFile('a.jpg');
    const reconstruction = buildReconstruction({
      cameras: [buildCamera({ cameraId: 1 }), buildCamera({ cameraId: 2 })],
      images: [imageB, imageA],
    });

    expect(buildPendingDeletionItems({
      reconstruction,
      pendingDeletions: new Set([99, imageB.imageId, imageA.imageId]),
      imageSource: {
        getImageSync: (name) => name === fileA.name ? fileA : undefined,
      },
    })).toEqual([
      { id: imageA.imageId, name: imageA.name, file: fileA, cameraId: imageA.cameraId },
      { id: imageB.imageId, name: imageB.name, file: undefined, cameraId: imageB.cameraId },
      { id: 99, name: 'Image 99', file: undefined, cameraId: undefined },
    ]);
  });

  it('derives selection, pagination, and display labels', () => {
    const cameraGroups = [
      { cameraId: 1, label: 'Camera 1', imageIds: [10, 20] },
      { cameraId: 2, label: 'Camera 2', imageIds: [30] },
    ];
    const frameGroups = [
      { frameId: 5, label: 'Frame 5', imageIds: [10, 30] },
    ];

    expect(getSelectedCameraGroupImageIds(cameraGroups, '1')).toEqual([10, 20]);
    expect(getSelectedCameraGroupImageIds(cameraGroups, '')).toEqual([]);
    expect(getSelectedFrameGroupImageIds(frameGroups, '5')).toEqual([10, 30]);
    expect(getSelectedFrameGroupImageIds(null, '5')).toEqual([]);
    expect(getDeletionCameraSelectOptions(cameraGroups)).toEqual([
      { value: '1', label: 'Camera 1' },
      { value: '2', label: 'Camera 2' },
    ]);
    expect(getDeletionFrameSelectOptions(frameGroups)).toEqual([
      { value: '5', label: 'Frame 5' },
    ]);
    expect(getDeletionFrameSelectOptions(null)).toEqual([]);
    expect(getPaginatedDeletionItems([1, 2, 3, 4, 5, 6], 1, 5)).toEqual({
      items: [6],
      totalPages: 2,
      clampedPage: 1,
    });
    expect(getPaginatedDeletionItems([1, 2, 3], 99, 2)).toMatchObject({
      items: [3],
      clampedPage: 1,
    });
    expect(getPaginatedDeletionItems([1, 2, 3], -5, 2)).toMatchObject({
      items: [1, 2],
      clampedPage: 0,
    });
    expect(getPreviousDeletionPage(0)).toBe(0);
    expect(getPreviousDeletionPage(2)).toBe(1);
    expect(getNextDeletionPage(1, 3)).toBe(2);
    expect(getNextDeletionPage(2, 3)).toBe(2);

    expect(getDeletionItemLabel({ id: 20, cameraId: 7 }, true)).toBe('#7:20');
    expect(getDeletionItemLabel({ id: 20, cameraId: 7 }, false)).toBe('#20');
    expect(getMarkedForDeletionLabel(1)).toBe('1 image marked for deletion:');
    expect(getMarkedForDeletionLabel(2)).toBe('2 images marked for deletion:');
    expect(getApplyDeletionLabel(3, false)).toBe('Apply (3)');
    expect(getApplyDeletionLabel(3, true)).toBe('Confirm Delete (3)');
    expect(hasMultipleDeletionCameras(buildReconstruction({
      cameras: [buildCamera({ cameraId: 1 }), buildCamera({ cameraId: 2 })],
    }))).toBe(true);
    expect(hasMultipleDeletionCameras(null)).toBe(false);
  });

  it('derives button state for bulk selectors and pagination controls', () => {
    expect(getDeletionBulkAddButtonState('')).toMatchObject({
      disabled: true,
    });
    expect(getDeletionBulkAddButtonState('').className).toContain('cursor-default');
    expect(getDeletionBulkAddButtonState('2')).toMatchObject({
      disabled: false,
    });
    expect(getDeletionBulkAddButtonState('2').className).toContain('hover:bg-ds-hover');

    expect(getDeletionPaginationButtonState('previous', 0, 3)).toMatchObject({
      disabled: true,
    });
    expect(getDeletionPaginationButtonState('previous', 1, 3)).toMatchObject({
      disabled: false,
    });
    expect(getDeletionPaginationButtonState('next', 1, 3)).toMatchObject({
      disabled: false,
    });
    expect(getDeletionPaginationButtonState('next', 2, 3)).toMatchObject({
      disabled: true,
    });
    expect(getDeletionPaginationButtonState('next', 2, 3).className).toContain('cursor-default');
  });

  it('derives deletion modal render styles and visibility policy', () => {
    expect(DELETION_MODAL_ESTIMATED_WIDTH).toBe(300);
    expect(DELETION_MODAL_ESTIMATED_HEIGHT).toBe(400);
    expect(getDeletionModalOverlayStyle(42)).toEqual({ zIndex: 42 });
    expect(getDeletionModalPanelStyle({ x: 12, y: 34 })).toEqual({
      left: 12,
      top: 34,
      width: DELETION_MODAL_ESTIMATED_WIDTH,
    });
    expect(getDeletionModalHeaderDragStyle()).toEqual({ touchAction: 'none' });
    expect(getDeletionApplyButtonStyle(false)).toBeUndefined();
    expect(getDeletionApplyButtonStyle(true)).toEqual({
      background: 'var(--bg-danger, #dc2626)',
      color: 'white',
    });
    expect(getDeletionThumbnailImageStyle()).toEqual({ filter: DELETED_FILTER });
    expect(shouldShowDeletionPagination(1)).toBe(false);
    expect(shouldShowDeletionPagination(2)).toBe(true);
  });
});
