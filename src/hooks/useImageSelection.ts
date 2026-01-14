/**
 * Hook for image selection interactions.
 *
 * Provides the selected image ID and consistent handlers for:
 * - Click: Select/deselect image
 * - Double-click: Open image detail modal
 * - Context menu (right-click): Fly camera to image
 */

import { useCallback } from 'react';
import { useViewerStore } from '../store';

interface ImageSelectionHandlers {
  /** Toggle selection of an image (click handler) */
  handleClick: (imageId: number) => void;
  /** Open image in detail modal (double-click handler) */
  handleDoubleClick: (imageId: number) => void;
  /** Fly camera to image (context menu handler) */
  handleContextMenu: (imageId: number) => void;
}

interface ImageSelectionResult extends ImageSelectionHandlers {
  /** Currently selected image ID, or null if none selected */
  selectedImageId: number | null;
}

/**
 * Hook to manage image selection state and interactions.
 *
 * @example
 * ```tsx
 * const { selectedImageId, handleClick, handleDoubleClick, handleContextMenu } = useImageSelection();
 *
 * <ImageItem
 *   isSelected={selectedImageId === image.imageId}
 *   onClick={() => handleClick(image.imageId)}
 *   onDoubleClick={() => handleDoubleClick(image.imageId)}
 *   onContextMenu={() => handleContextMenu(image.imageId)}
 * />
 * ```
 */
export function useImageSelection(): ImageSelectionResult {
  const selectedImageId = useViewerStore((s) => s.selectedImageId);
  const setSelectedImageId = useViewerStore((s) => s.setSelectedImageId);
  const openImageDetail = useViewerStore((s) => s.openImageDetail);
  const flyToImage = useViewerStore((s) => s.flyToImage);

  const handleClick = useCallback((imageId: number) => {
    setSelectedImageId(imageId);
  }, [setSelectedImageId]);

  const handleDoubleClick = useCallback((imageId: number) => {
    openImageDetail(imageId);
  }, [openImageDetail]);

  const handleContextMenu = useCallback((imageId: number) => {
    flyToImage(imageId);
  }, [flyToImage]);

  return {
    selectedImageId,
    handleClick,
    handleDoubleClick,
    handleContextMenu,
  };
}
