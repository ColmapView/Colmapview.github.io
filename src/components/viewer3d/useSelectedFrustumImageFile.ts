import { useEffect, useState } from 'react';
import type { DatasetManager } from '../../dataset';
import { shouldFetchSelectedFrustumImageFile } from './cameraFrustumViewModel';

interface SelectedFrustumImageFileOptions {
  dataset: DatasetManager;
  imageName: string;
  imageFile?: File;
  isSelected: boolean;
  showImagePlane: boolean;
}

export function useSelectedFrustumImageFile({
  dataset,
  imageName,
  imageFile,
  isSelected,
  showImagePlane,
}: SelectedFrustumImageFileOptions): File | undefined {
  const [fetchedImageFile, setFetchedImageFile] = useState<{ dataset: DatasetManager; imageName: string; file: File } | null>(null);
  const shouldFetch = shouldFetchSelectedFrustumImageFile({
    isSelected,
    showImagePlane,
    hasImageFile: Boolean(imageFile),
  });

  useEffect(() => {
    if (!shouldFetch) return;

    const controller = new AbortController();

    const fetchImage = async () => {
      const file = await dataset.getImage(imageName, { signal: controller.signal, priority: 'selected' });

      if (!controller.signal.aborted && file) {
        setFetchedImageFile({ dataset, imageName, file });
      }
    };

    fetchImage();

    return () => {
      controller.abort();
    };
  }, [dataset, imageName, shouldFetch]);

  const fetchedFile = fetchedImageFile?.dataset === dataset && fetchedImageFile.imageName === imageName
    ? fetchedImageFile.file
    : undefined;

  return imageFile ?? (shouldFetch ? fetchedFile : undefined);
}
