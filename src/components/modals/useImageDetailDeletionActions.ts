import { useCallback, useMemo } from 'react';
import type { ImageId, Reconstruction } from '../../types/colmap';
import { requestConfirmation } from '../../utils/confirmation';
import {
  areAllMarkedForDeletion,
  getCameraImageIds,
  getFrameImageIds,
} from './imageDetailDeletionViewModel';
import { useImageDetailDeletionStoreFacade } from './useImageDetailDeletionStoreFacade';

interface UseImageDetailDeletionActionsOptions {
  reconstruction: Reconstruction | null;
  imageDetailId: ImageId | null;
}

export function useImageDetailDeletionActions({
  reconstruction,
  imageDetailId,
}: UseImageDetailDeletionActionsOptions) {
  const {
    data: {
      multiCamera,
      pendingDeletions,
    },
    actions: {
      markBulkForDeletion,
      toggleDeletion,
      unmarkBulkDeletion,
    },
  } = useImageDetailDeletionStoreFacade();

  const isMarkedForDeletion = imageDetailId !== null && pendingDeletions.has(imageDetailId);

  const cameraImageIds = useMemo(
    () => getCameraImageIds(reconstruction, imageDetailId),
    [reconstruction, imageDetailId]
  );
  const frameImageIds = useMemo(
    () => getFrameImageIds(reconstruction, imageDetailId),
    [reconstruction, imageDetailId]
  );

  const cameraAllMarked = areAllMarkedForDeletion(cameraImageIds, pendingDeletions);
  const frameAllMarked = areAllMarkedForDeletion(frameImageIds, pendingDeletions);

  const handleDeleteToggle = useCallback(async () => {
    if (imageDetailId === null) return;

    if (isMarkedForDeletion) {
      toggleDeletion(imageDetailId);
      return;
    }

    if (await requestConfirmation({
      title: 'Mark image for deletion?',
      message: 'You can restore it or apply the deletion later.',
      confirmLabel: 'Mark',
      tone: 'danger',
    })) {
      toggleDeletion(imageDetailId);
    }
  }, [imageDetailId, isMarkedForDeletion, toggleDeletion]);

  const handleToggleCamera = useCallback(async () => {
    if (cameraImageIds.length === 0) return;

    if (cameraAllMarked) {
      unmarkBulkDeletion(cameraImageIds);
      return;
    }

    if (await requestConfirmation({
      title: 'Mark camera images?',
      message: `Mark all ${cameraImageIds.length} images from this camera for deletion?`,
      confirmLabel: 'Mark all',
      tone: 'danger',
    })) {
      markBulkForDeletion(cameraImageIds);
    }
  }, [cameraAllMarked, cameraImageIds, markBulkForDeletion, unmarkBulkDeletion]);

  const handleToggleFrame = useCallback(async () => {
    if (frameImageIds.length === 0) return;

    if (frameAllMarked) {
      unmarkBulkDeletion(frameImageIds);
      return;
    }

    if (await requestConfirmation({
      title: 'Mark frame images?',
      message: `Mark all ${frameImageIds.length} images in this frame for deletion?`,
      confirmLabel: 'Mark all',
      tone: 'danger',
    })) {
      markBulkForDeletion(frameImageIds);
    }
  }, [frameAllMarked, frameImageIds, markBulkForDeletion, unmarkBulkDeletion]);

  return {
    cameraAllMarked,
    frameAllMarked,
    frameImageIds,
    handleDeleteToggle,
    handleToggleCamera,
    handleToggleFrame,
    isMarkedForDeletion,
    multiCamera,
    pendingDeletions,
  };
}
