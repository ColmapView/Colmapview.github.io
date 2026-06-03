import { useEffect } from 'react';
import {
  type ImageData,
  type ViewMode,
} from './useImageGalleryViewModel';
import { getImageGalleryKeyboardNavigationAction } from './imageGalleryKeyboardNavigationPolicy';

interface ImageGalleryKeyboardNavigationOptions {
  images: ImageData[];
  selectedImageId: number | null;
  viewMode: ViewMode;
  galleryColumns: number;
  onSelectImage: (imageId: number) => void;
  onNavigateToImage: (imageId: number) => void;
}

export function useImageGalleryKeyboardNavigation({
  images,
  selectedImageId,
  viewMode,
  galleryColumns,
  onSelectImage,
  onNavigateToImage,
}: ImageGalleryKeyboardNavigationOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const action = getImageGalleryKeyboardNavigationAction({
        key: e.key,
        target: e.target,
        shiftKey: e.shiftKey,
        images,
        selectedImageId,
        viewMode,
        galleryColumns,
      });

      if (action === null) return;

      e.preventDefault();
      if (action.type === 'navigate') {
        onNavigateToImage(action.imageId);
      } else {
        onSelectImage(action.imageId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images, selectedImageId, viewMode, galleryColumns, onSelectImage, onNavigateToImage]);
}
