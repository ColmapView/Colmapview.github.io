import { useEffect } from 'react';
import type { ImageId, Reconstruction } from '../../types/colmap';
import type { DatasetAccessOptions } from '../../dataset';

export interface SelectedFrustumImageSource {
  hasImages(): boolean;
  getImageSync(name: string): File | null | undefined;
  getImage(name: string, options?: DatasetAccessOptions): Promise<File | null | undefined>;
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

    const controller = new AbortController();

    imageSource.getImage(selectedImage.name, { signal: controller.signal, priority: 'selected' }).then((file) => {
      if (!controller.signal.aborted && file) {
        onImageLoaded();
      }
    });

    return () => {
      controller.abort();
    };
  }, [imageSource, reconstruction, selectedImageId, onImageLoaded]);
}
