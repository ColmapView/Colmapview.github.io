import { useEffect, useMemo, useState } from 'react';
import type { DatasetManager } from '../../dataset';
import { useFileUrl } from '../../hooks/useFileUrl';
import type { Image, ImageId, Reconstruction } from '../../types/colmap';
import {
  getImageNamesToFetch,
  getMaskNameToFetch,
} from './imageDetailFileViewModel';

interface AsyncMaskFile {
  imageName: string;
  file: File | null;
  dataset: DatasetManager;
}

interface UseImageDetailFilesOptions {
  dataset: DatasetManager;
  reconstruction: Reconstruction | null;
  imageDetailId: ImageId | null;
  matchedImageId: ImageId | null;
  image: Image | null;
  matchedImage: Image | null;
}

export function useImageDetailFiles({
  dataset,
  reconstruction,
  imageDetailId,
  matchedImageId,
  image,
  matchedImage,
}: UseImageDetailFilesOptions) {
  const [imageCacheVersion, setImageCacheVersion] = useState(0);
  const [asyncMaskFile, setAsyncMaskFile] = useState<AsyncMaskFile | null>(null);

  useEffect(() => {
    const namesToFetch = getImageNamesToFetch({
      reconstruction,
      imageDetailId,
      matchedImageId,
      hasImages: dataset.hasImages(),
      isImageCached: (imageName) => dataset.getImageSync(imageName) !== undefined,
    });
    if (namesToFetch.length === 0) return;

    let cancelled = false;
    Promise.all(namesToFetch.map(name => dataset.getImage(name))).then((results) => {
      if (!cancelled && results.some(file => file !== null)) {
        setImageCacheVersion(version => version + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [dataset, reconstruction, imageDetailId, matchedImageId]);

  useEffect(() => {
    const maskName = getMaskNameToFetch({
      reconstruction,
      imageDetailId,
      hasMasks: dataset.hasMasks(),
      isMaskCached: (imageName) => dataset.getMaskSync(imageName) !== undefined,
    });
    if (!maskName) return;

    let cancelled = false;
    dataset.getMask(maskName).then((file) => {
      if (!cancelled) {
        setAsyncMaskFile({ imageName: maskName, file, dataset });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [dataset, reconstruction, imageDetailId]);

  const imageFile = useMemo(() => {
    void imageCacheVersion;
    if (!image) return null;
    return dataset.getImageSync(image.name) ?? null;
  }, [image, dataset, imageCacheVersion]);

  const maskFile = useMemo(() => {
    if (!image || !dataset.hasMasks()) return null;
    return dataset.getMaskSync(image.name) ?? (
      asyncMaskFile?.dataset === dataset && asyncMaskFile.imageName === image.name ? asyncMaskFile.file : null
    );
  }, [image, dataset, asyncMaskFile]);

  const matchedImageFile = useMemo(() => {
    void imageCacheVersion;
    if (!matchedImage) return null;
    return dataset.getImageSync(matchedImage.name) ?? null;
  }, [matchedImage, dataset, imageCacheVersion]);

  return {
    imageFile,
    imageSrc: useFileUrl(imageFile),
    maskFile,
    maskSrc: useFileUrl(maskFile),
    matchedImageFile,
    matchedImageSrc: useFileUrl(matchedImageFile),
  };
}
