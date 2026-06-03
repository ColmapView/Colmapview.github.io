/**
 * Modal for managing image deletions with preview list.
 * Triggered from ExportPanel button.
 */

import { useState, useCallback, useEffect, useMemo, memo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useModalZIndex } from '../../hooks/useModalZIndex';
import { useModalDrag } from '../../hooks/useModalDrag';
import { useResetKeyedState } from '../../hooks/useResetKeyedState';
import { useDataset } from '../../dataset';
import { controlPanelStyles, tableStyles } from '../../theme';
import { FloatingWindowShell } from '../ui/FloatingWindowShell';
import { DeletionBulkSelector } from './DeletionBulkSelector';
import { DeletionModalListItem } from './DeletionModalListItem';
import {
  buildDeletionCameraGroups,
  buildDeletionFrameGroups,
  buildPendingDeletionItems,
  getApplyDeletionLabel,
  getDeletionCameraSelectOptions,
  getDeletionFrameSelectOptions,
  getDeletionItemLabel,
  getDeletionApplyButtonStyle,
  getDeletionModalHeaderDragStyle,
  getDeletionModalOverlayStyle,
  getDeletionModalPanelStyle,
  getDeletionPaginationButtonState,
  getMarkedForDeletionLabel,
  getNextDeletionPage,
  getPaginatedDeletionItems,
  getPreviousDeletionPage,
  getSelectedCameraGroupImageIds,
  getSelectedFrameGroupImageIds,
  hasMultipleDeletionCameras,
  shouldShowDeletionPagination,
  DELETION_MODAL_ESTIMATED_HEIGHT,
  DELETION_MODAL_ESTIMATED_WIDTH,
  DELETION_MODAL_PAGE_SIZE,
} from './deletionModalViewModel';
import { useDeletionModalStoreFacade } from './useDeletionModalStoreFacade';

const styles = controlPanelStyles;
const CLOSED_DELETION_MODAL_RESET_KEY = Symbol('closed-deletion-modal');
const deletionTableHeaderCellClass = `${tableStyles.headerCell} px-2 py-1 text-xs font-medium whitespace-nowrap`;

export interface DeletionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeletionModal = memo(function DeletionModal({
  isOpen,
  onClose,
}: DeletionModalProps) {
  const {
    data: { reconstruction, pendingDeletions },
    actions: {
      unmarkDeletion,
      markBulkForDeletion,
      openImageDetail,
      applyDeletions,
      resetDeletions,
    },
  } = useDeletionModalStoreFacade();
  const dataset = useDataset();

  const hasPendingDeletions = pendingDeletions.size > 0;

  // Bulk selection state
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [selectedFrameId, setSelectedFrameId] = useState<string>('');

  const cameraGroups = useMemo(() => buildDeletionCameraGroups(reconstruction), [reconstruction]);
  const frameGroups = useMemo(() => buildDeletionFrameGroups(reconstruction), [reconstruction]);
  const cameraOptions = useMemo(() => getDeletionCameraSelectOptions(cameraGroups), [cameraGroups]);
  const frameOptions = useMemo(() => getDeletionFrameSelectOptions(frameGroups), [frameGroups]);

  const handleAddByCamera = useCallback(() => {
    const imageIds = getSelectedCameraGroupImageIds(cameraGroups, selectedCameraId);
    if (imageIds.length > 0) markBulkForDeletion(imageIds);
    setSelectedCameraId('');
  }, [selectedCameraId, cameraGroups, markBulkForDeletion]);

  const handleAddByFrame = useCallback(() => {
    const imageIds = getSelectedFrameGroupImageIds(frameGroups, selectedFrameId);
    if (imageIds.length > 0) markBulkForDeletion(imageIds);
    setSelectedFrameId('');
  }, [selectedFrameId, frameGroups, markBulkForDeletion]);

  const modalResetKey = isOpen ? pendingDeletions : CLOSED_DELETION_MODAL_RESET_KEY;
  const [page, setPage] = useResetKeyedState(modalResetKey, 0);

  // Inline confirmation state (replaces window.confirm which blocks R3F pointer events)
  const [confirming, setConfirming] = useResetKeyedState(modalResetKey, false);

  // Auto-reset confirming after 3 seconds
  useEffect(() => {
    if (!confirming) return;

    const confirmTimerId = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(confirmTimerId);
  }, [confirming, setConfirming]);

  // Position and drag
  const { position, panelRef, handleDragStart } = useModalDrag({
    estimatedWidth: DELETION_MODAL_ESTIMATED_WIDTH,
    estimatedHeight: DELETION_MODAL_ESTIMATED_HEIGHT,
    isOpen,
  });

  // Z-index management for stacking multiple modals
  const { zIndex, bringToFront } = useModalZIndex(isOpen);

  useHotkeys('escape', onClose, { enabled: isOpen }, [isOpen, onClose]);

  // Get image data for pending deletions (including file for thumbnail)
  const pendingDeletionsList = useMemo(
    () => buildPendingDeletionItems({ reconstruction, pendingDeletions, imageSource: dataset }),
    [reconstruction, pendingDeletions, dataset]
  );

  const multiCamera = hasMultipleDeletionCameras(reconstruction);
  const {
    items: pagedList,
    totalPages,
    clampedPage,
  } = getPaginatedDeletionItems(pendingDeletionsList, page, DELETION_MODAL_PAGE_SIZE);
  const previousPageButton = getDeletionPaginationButtonState('previous', clampedPage, totalPages);
  const nextPageButton = getDeletionPaginationButtonState('next', clampedPage, totalPages);

  const handleApply = useCallback(() => {
    if (!hasPendingDeletions) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    // Second click — execute
    setConfirming(false);
    applyDeletions();
    onClose();
  }, [hasPendingDeletions, confirming, setConfirming, applyDeletions, onClose]);

  const handleReset = useCallback(() => {
    resetDeletions();
  }, [resetDeletions]);

  const handleViewImage = useCallback((id: number) => {
    openImageDetail(id);
  }, [openImageDetail]);

  if (!isOpen) return null;

  return (
    <FloatingWindowShell
      isOpen={isOpen}
      title="Delete Images from Model"
      onClose={onClose}
      panelRef={panelRef}
      overlayStyle={getDeletionModalOverlayStyle(zIndex)}
      panelStyle={getDeletionModalPanelStyle(position)}
      headerStyle={getDeletionModalHeaderDragStyle()}
      onPanelPointerDown={bringToFront}
      onHeaderPointerDown={handleDragStart}
    >
        {/* Content */}
        <div className="px-4 py-2 space-y-2">
          <DeletionBulkSelector
            label="Select by camera:"
            value={selectedCameraId}
            options={cameraOptions}
            placeholder="Choose camera..."
            addTitle="Add all images from this camera"
            onChange={setSelectedCameraId}
            onAdd={handleAddByCamera}
          />

          <DeletionBulkSelector
            label="Select by frame:"
            value={selectedFrameId}
            options={frameOptions}
            placeholder="Choose frame..."
            addTitle="Add all images from this frame"
            onChange={setSelectedFrameId}
            onAdd={handleAddByFrame}
          />

          {hasPendingDeletions ? (
            <>
              {/* List of pending deletions */}
              <div className="text-ds-secondary text-sm">
                {getMarkedForDeletionLabel(pendingDeletions.size)}
              </div>
              <table className={`${tableStyles.table} table-fixed text-xs`}>
                <colgroup>
                  <col className="w-11" />
                  <col className="w-20" />
                  <col />
                  <col className="w-8" />
                </colgroup>
                <thead className={tableStyles.header}>
                  <tr>
                    <th className={deletionTableHeaderCellClass}>Preview</th>
                    <th className={deletionTableHeaderCellClass}>Entry</th>
                    <th className={deletionTableHeaderCellClass}>Name</th>
                    <th className={deletionTableHeaderCellClass} aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {pagedList.map(({ id, name, file, cameraId }) => (
                    <DeletionModalListItem
                      key={id}
                      id={id}
                      label={getDeletionItemLabel({ id, cameraId }, multiCamera)}
                      name={name}
                      file={file}
                      onView={handleViewImage}
                      onRestore={unmarkDeletion}
                    />
                  ))}
                </tbody>
              </table>
              {/* Pagination controls */}
              {shouldShowDeletionPagination(totalPages) && (
                <div className="flex items-center justify-between text-xs text-ds-secondary">
                  <button
                    onClick={() => setPage(getPreviousDeletionPage)}
                    disabled={previousPageButton.disabled}
                    className={previousPageButton.className}
                  >
                    Prev
                  </button>
                  <span>{clampedPage + 1} / {totalPages}</span>
                  <button
                    onClick={() => setPage((currentPage) => getNextDeletionPage(currentPage, totalPages))}
                    disabled={nextPageButton.disabled}
                    className={nextPageButton.className}
                  >
                    Next
                  </button>
                </div>
              )}

              {/* Action buttons */}
              <div className={styles.actionGroup}>
                <button
                  onClick={handleReset}
                  className={styles.actionButton}
                >
                  Restore All
                </button>
                <button
                  onClick={handleApply}
                  className={styles.actionButtonPrimary}
                  style={getDeletionApplyButtonStyle(confirming)}
                >
                  {getApplyDeletionLabel(pendingDeletions.size, confirming)}
                </button>
              </div>

              <div className="text-ds-warning text-xs">
                Click "Apply" to permanently remove images from the reconstruction.
              </div>
            </>
          ) : (
            <div className="text-ds-secondary text-sm py-2">
              <div className="text-ds-muted text-xs">
                Or open an image detail modal and click the trash icon to mark individual images.
              </div>
            </div>
          )}
        </div>
    </FloatingWindowShell>
  );
});
