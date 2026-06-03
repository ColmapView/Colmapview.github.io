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
  const [fetchedImageFile, setFetchedImageFile] = useState<{ imageName: string; file: File } | null>(null);
  const shouldFetch = shouldFetchSelectedFrustumImageFile({
    isSelected,
    showImagePlane,
    hasImageFile: Boolean(imageFile),
  });

  useEffect(() => {
    if (!shouldFetch) return;

    let cancelled = false;

    const fetchImage = async () => {
      const file = await dataset.getImage(imageName);

      if (!cancelled && file) {
        setFetchedImageFile({ imageName, file });
      }
    };

    fetchImage();

    return () => {
      cancelled = true;
    };
  }, [dataset, imageName, shouldFetch]);

  const fetchedFile = fetchedImageFile?.imageName === imageName
    ? fetchedImageFile.file
    : undefined;

  return imageFile ?? (shouldFetch ? fetchedFile : undefined);
}
