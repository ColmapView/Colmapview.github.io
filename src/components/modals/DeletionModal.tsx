/**
 * Modal for managing image deletions with preview list.
 * Triggered from ExportPanel button.
 */

import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  useReconstructionStore,
  useUIStore,
  useDeletionStore,
  applyDeletionsToData,
  resetDeletionsWithCleanup,
} from '../../store';
import { useModalZIndex } from '../../hooks/useModalZIndex';
import { useThumbnail } from '../../hooks/useThumbnail';
import { getImageFile, getUrlImageCached, getZipImageCached, isZipLoadingAvailable } from '../../utils/imageFileUtils';
import { modalStyles, controlPanelStyles, inputStyles, MODAL_POSITION, DELETED_FILTER } from '../../theme';
import { ResetIcon } from '../../icons';
import { CameraModelId } from '../../types/colmap';
import { SensorType } from '../../types/rig';

const CAMERA_MODEL_NAMES: Record<number, string> = {
  [CameraModelId.SIMPLE_PINHOLE]: 'Simple Pinhole',
  [CameraModelId.PINHOLE]: 'Pinhole',
  [CameraModelId.SIMPLE_RADIAL]: 'Simple Radial',
  [CameraModelId.RADIAL]: 'Radial',
  [CameraModelId.OPENCV]: 'OpenCV',
  [CameraModelId.OPENCV_FISHEYE]: 'OpenCV Fisheye',
  [CameraModelId.FULL_OPENCV]: 'Full OpenCV',
  [CameraModelId.FOV]: 'FOV',
  [CameraModelId.SIMPLE_RADIAL_FISHEYE]: 'Simple Radial Fisheye',
  [CameraModelId.RADIAL_FISHEYE]: 'Radial Fisheye',
  [CameraModelId.THIN_PRISM_FISHEYE]: 'Thin Prism Fisheye',
  [CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE]: 'Rad-Tan Thin Prism',
};

const styles = controlPanelStyles;

// Thumbnail component for deletion list items
interface DeletionListItemProps {
  id: number;
  label: string;
  name: string;
  file: File | undefined;
  onView: (id: number) => void;
  onRestore: (id: number) => void;
}

const DeletionListItem = memo(function DeletionListItem({ id, label, name, file, onView, onRestore }: DeletionListItemProps) {
  const src = useThumbnail(file, name, true);

  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-ds-secondary rounded text-xs">
      {/* Thumbnail with grayscale + X overlay */}
      <div className="w-8 h-8 flex-shrink-0 rounded overflow-hidden relative bg-ds-tertiary">
        {src ? (
          <img
            src={src}
            alt={name}
            className="w-full h-full object-cover"
            style={{ filter: DELETED_FILTER }}
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ds-muted text-[8px]">
            {id}
          </div>
        )}
        {/* Diagonal X overlay */}
        <div className="absolute inset-0 pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="0" y1="0" x2="100" y2="100" stroke="var(--bg-primary)" strokeWidth="3" />
            <line x1="100" y1="0" x2="0" y2="100" stroke="var(--bg-primary)" strokeWidth="3" />
          </svg>
        </div>
      </div>
      <button
        onClick={() => onView(id)}
        className="flex-1 text-left text-ds-primary hover:text-ds-accent truncate"
        title={`View ${name}`}
      >
        {label}: {name}
      </button>
      <button
        onClick={() => onRestore(id)}
        className="text-ds-success hover:bg-ds-success/20 p-1 rounded"
        title="Restore"
      >
        <ResetIcon className="w-3 h-3" />
      </button>
    </div>
  );
});

export interface DeletionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeletionModal = memo(function DeletionModal({
  isOpen,
  onClose,
}: DeletionModalProps) {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const imageUrlBase = useReconstructionStore((s) => s.imageUrlBase);
  const pendingDeletions = useDeletionStore((s) => s.pendingDeletions);
  const unmarkDeletion = useDeletionStore((s) => s.unmarkDeletion);
  const markBulkForDeletion = useDeletionStore((s) => s.markBulkForDeletion);
  const openImageDetail = useUIStore((s) => s.openImageDetail);

  const hasPendingDeletions = pendingDeletions.size > 0;

  // Bulk selection state
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [selectedFrameId, setSelectedFrameId] = useState<string>('');

  // Camera groups: cameraId -> { label, imageIds[] }
  const cameraGroups = useMemo(() => {
    if (!reconstruction) return [];
    const groups = new Map<number, { label: string; imageIds: number[] }>();
    for (const [imageId, image] of reconstruction.images) {
      let group = groups.get(image.cameraId);
      if (!group) {
        const camera = reconstruction.cameras.get(image.cameraId);
        const modelName = camera ? (CAMERA_MODEL_NAMES[camera.modelId] ?? 'Unknown') : 'Unknown';
        const res = camera ? `${camera.width}x${camera.height}` : '';
        group = { label: `Camera ${image.cameraId}: ${modelName} ${res}`, imageIds: [] };
        groups.set(image.cameraId, group);
      }
      group.imageIds.push(imageId);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([cameraId, { label, imageIds }]) => ({
        cameraId,
        label: `${label} (${imageIds.length} img${imageIds.length !== 1 ? 's' : ''})`,
        imageIds,
      }));
  }, [reconstruction]);

  // Frame groups: only when rigData exists
  const frameGroups = useMemo(() => {
    if (!reconstruction?.rigData) return null;
    return Array.from(reconstruction.rigData.frames.entries())
      .sort(([a], [b]) => a - b)
      .map(([frameId, frame]) => {
        const cameraDataIds = frame.dataIds
          .filter((d) => d.sensorId.type === SensorType.CAMERA && reconstruction.images.has(d.dataId))
          .map((d) => d.dataId);
        return {
          frameId,
          label: `Frame ${frameId} (${cameraDataIds.length} img${cameraDataIds.length !== 1 ? 's' : ''})`,
          imageIds: cameraDataIds,
        };
      })
      .filter((g) => g.imageIds.length > 0);
  }, [reconstruction]);

  const handleAddByCamera = useCallback(() => {
    const id = Number(selectedCameraId);
    const group = cameraGroups.find((g) => g.cameraId === id);
    if (group) markBulkForDeletion(group.imageIds);
    setSelectedCameraId('');
  }, [selectedCameraId, cameraGroups, markBulkForDeletion]);

  const handleAddByFrame = useCallback(() => {
    const id = Number(selectedFrameId);
    const group = frameGroups?.find((g) => g.frameId === id);
    if (group) markBulkForDeletion(group.imageIds);
    setSelectedFrameId('');
  }, [selectedFrameId, frameGroups, markBulkForDeletion]);

  // Pagination state (derived values computed after pendingDeletionsList)
  const PAGE_SIZE = 5;
  const [page, setPage] = useState(0);

  // Reset page when list changes (items added/removed) or modal closes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(0);
  }, [pendingDeletions, isOpen]);

  // Inline confirmation state (replaces window.confirm which blocks R3F pointer events)
  const [confirming, setConfirming] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Reset confirming state when pendingDeletions changes or modal closes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirming(false);
  }, [pendingDeletions, isOpen]);

  // Auto-reset confirming after 3 seconds
  useEffect(() => {
    if (confirming) {
      confirmTimerRef.current = setTimeout(() => setConfirming(false), 3000);
      return () => clearTimeout(confirmTimerRef.current);
    }
  }, [confirming]);

  // Position and drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Z-index management for stacking multiple modals
  const { zIndex, bringToFront } = useModalZIndex(isOpen);

  // Center modal function
  const centerModal = useCallback(() => {
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      setPosition({
        x: (viewportW - rect.width) / 2,
        y: Math.max(MODAL_POSITION.minTop, (viewportH - rect.height) / 2),
      });
    }
  }, []);

  // Center modal when opened
  useEffect(() => {
    if (isOpen) {
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPosition({
        x: (viewportW - 300) / 2,
        y: Math.max(MODAL_POSITION.minTop, (viewportH - 400) / 2),
      });
      requestAnimationFrame(centerModal);
    }
  }, [isOpen, centerModal]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  }, [position]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: dragStart.current.posX + e.clientX - dragStart.current.x,
          y: dragStart.current.posY + e.clientY - dragStart.current.y,
        });
      }
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  useHotkeys('escape', onClose, { enabled: isOpen }, [isOpen, onClose]);

  // Get image data for pending deletions (including file for thumbnail)
  const pendingDeletionsList = useMemo(() => {
    if (!reconstruction) return [];
    const imageFiles = loadedFiles?.imageFiles;

    return Array.from(pendingDeletions)
      .map(id => {
        const image = reconstruction.images.get(id);
        const name = image?.name ?? `Image ${id}`;

        // Get image file for thumbnail
        let file: File | undefined;
        if (imageUrlBase) {
          file = getUrlImageCached(name);
        } else if (isZipLoadingAvailable()) {
          file = getZipImageCached(name) ?? undefined;
        } else {
          file = getImageFile(imageFiles, name);
        }

        return { id, name, file, cameraId: image?.cameraId };
      })
      .sort((a, b) => a.id - b.id);
  }, [reconstruction, pendingDeletions, loadedFiles, imageUrlBase]);

  const multiCamera = reconstruction ? reconstruction.cameras.size > 1 : false;

  // Pagination derived values
  const totalPages = Math.max(1, Math.ceil(pendingDeletionsList.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const pagedList = pendingDeletionsList.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE);

  const handleApply = useCallback(() => {
    if (!hasPendingDeletions) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    // Second click — execute
    setConfirming(false);
    applyDeletionsToData();
    onClose();
  }, [hasPendingDeletions, confirming, onClose]);

  const handleReset = useCallback(() => {
    resetDeletionsWithCleanup();
  }, []);

  const handleViewImage = useCallback((id: number) => {
    openImageDetail(id);
  }, [openImageDetail]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
      <div
        ref={panelRef}
        className={modalStyles.toolPanel}
        style={{ left: position.x, top: position.y, width: 300 }}
        onMouseDown={bringToFront}
      >
        {/* Header */}
        <div
          className={modalStyles.toolHeader}
          onMouseDown={handleDragStart}
        >
          <span className={modalStyles.toolHeaderTitle}>Delete Images</span>
          <button
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            className={modalStyles.toolHeaderClose}
            title="Close"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-3 space-y-3">
          {/* Bulk select by camera */}
          {cameraGroups.length > 0 && (
            <div>
              <div className="text-ds-secondary text-xs mb-1">Select by camera:</div>
              <div className="flex gap-1 items-center">
                <select
                  value={selectedCameraId}
                  onChange={(e) => setSelectedCameraId(e.target.value)}
                  className={`${inputStyles.select} ${inputStyles.selectSizes.xs} flex-1`}
                >
                  <option value="">Choose camera...</option>
                  {cameraGroups.map((g) => (
                    <option key={g.cameraId} value={g.cameraId}>
                      {g.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddByCamera}
                  disabled={!selectedCameraId}
                  className={`p-1 rounded transition-colors ${selectedCameraId ? 'text-ds-accent hover:bg-ds-hover' : 'text-ds-muted cursor-default'}`}
                  title="Add all images from this camera"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Bulk select by frame (only when rig data exists) */}
          {frameGroups && frameGroups.length > 0 && (
            <div>
              <div className="text-ds-secondary text-xs mb-1">Select by frame:</div>
              <div className="flex gap-1 items-center">
                <select
                  value={selectedFrameId}
                  onChange={(e) => setSelectedFrameId(e.target.value)}
                  className={`${inputStyles.select} ${inputStyles.selectSizes.xs} flex-1`}
                >
                  <option value="">Choose frame...</option>
                  {frameGroups.map((g) => (
                    <option key={g.frameId} value={g.frameId}>
                      {g.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddByFrame}
                  disabled={!selectedFrameId}
                  className={`p-1 rounded transition-colors ${selectedFrameId ? 'text-ds-accent hover:bg-ds-hover' : 'text-ds-muted cursor-default'}`}
                  title="Add all images from this frame"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {hasPendingDeletions ? (
            <>
              {/* List of pending deletions */}
              <div className="text-ds-secondary text-sm">
                {pendingDeletions.size} image{pendingDeletions.size !== 1 ? 's' : ''} marked for deletion:
              </div>
              <div className="space-y-1">
                {pagedList.map(({ id, name, file, cameraId }) => (
                  <DeletionListItem
                    key={id}
                    id={id}
                    label={multiCamera && cameraId != null ? `#${cameraId}:${id}` : `#${id}`}
                    name={name}
                    file={file}
                    onView={handleViewImage}
                    onRestore={unmarkDeletion}
                  />
                ))}
              </div>
              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-ds-secondary">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={clampedPage === 0}
                    className={clampedPage === 0 ? 'text-ds-muted cursor-default' : 'text-ds-accent hover:underline'}
                  >
                    Prev
                  </button>
                  <span>{clampedPage + 1} / {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={clampedPage >= totalPages - 1}
                    className={clampedPage >= totalPages - 1 ? 'text-ds-muted cursor-default' : 'text-ds-accent hover:underline'}
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
                  style={confirming ? { background: 'var(--bg-danger, #dc2626)', color: 'white' } : undefined}
                >
                  {confirming ? `Confirm Delete (${pendingDeletions.size})` : `Apply (${pendingDeletions.size})`}
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
      </div>
    </div>
  );
});
