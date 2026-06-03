import { useEffect } from 'react';
import type { ImageId, Reconstruction } from '../../types/colmap';

export interface SelectedFrustumImageSource {
  hasImages(): boolean;
  getImageSync(name: string): File | null | undefined;
  getImage(name: string): Promise<File | null | undefined>;
}

interface SelectedFrustumImageCacheRefreshOptions {
  imageSource: SelectedFrustumImageSource;
  reconstruction: Reconstruction | null;
  selectedImageId: ImageId | null;
  onImageLoaded: () => void;
}

export function useSelectedFrustumImageCacheRefresh({
  imageSource,
  reconstruction,
  selectedImageId,
  onImageLoaded,
}: SelectedFrustumImageCacheRefreshOptions): void {
  useEffect(() => {
    if (!imageSource.hasImages() || !reconstruction || selectedImageId === null) {
      return;
    }

    const selectedImage = reconstruction.images.get(selectedImageId);
    if (!selectedImage) return;

    if (imageSource.getImageSync(selectedImage.name)) return;

    let cancelled = false;

    imageSource.getImage(selectedImage.name).then((file) => {
      if (!cancelled && file) {
        onImageLoaded();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imageSource, reconstruction, selectedImageId, onImageLoaded]);
}
