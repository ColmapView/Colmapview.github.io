import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DatasetManager } from '../../dataset';
import type { DatasetAccessOptions } from '../../dataset/types';
import { useFileUrl } from '../../hooks/useFileUrl';
import type { Image, ImageId, Reconstruction } from '../../types/colmap';

interface UseImageDetailFilesOptions {
  dataset: DatasetManager;
  reconstruction: Reconstruction | null;
  imageDetailId: ImageId | null;
  matchedImageId: ImageId | null;
  image: Image | null;
  matchedImage: Image | null;
}

/** Each visible consumer holds its File independently of cache eviction or the other pane. */
function useActiveDetailFile(
  dataset: DatasetManager,
  reconstruction: Reconstruction | null,
  image: Image | null,
  mask = false,
) {
  const name = image?.name;
  const imageId = image?.imageId;
  const available = mask ? dataset.hasMasks() : dataset.hasImages();
  const identity = useMemo(() => ({ dataset, reconstruction, name, imageId, mask, available }),
    [dataset, reconstruction, name, imageId, mask, available]);
  const readCached = () => name && available
    ? (mask ? dataset.getMaskSync(name) : dataset.getImageSync(name)) ?? null : null;
  const [owned, setOwned] = useState(() => ({ identity, file: readCached(), failed: false, attempt: 0 }));
  // Updating derived state during render releases the old resource before it can be displayed
  // under a new reconstruction/name, and snapshots synchronous hits before async work evicts them.
  let current = owned;
  if (owned.identity !== identity) {
    current = { identity, file: readCached(), failed: false, attempt: 0 };
    setOwned(current);
  }
  const retry = useCallback(() => {
    setOwned(previous => previous.identity === identity
      ? { ...previous, failed: false, attempt: previous.attempt + 1 } : previous);
  }, [identity]);

  useEffect(() => {
    if (!name || !available || current.file) return;
    const controller = new AbortController();
    let failed = false;
    const access: DatasetAccessOptions = {
      signal: controller.signal,
      priority: 'selected',
      onError: error => { if (error.kind !== 'aborted') failed = true; },
    };
    const pending = mask ? dataset.getMask(name, access) : dataset.getImage(name, access);
    void pending.then(file => {
      if (!controller.signal.aborted) setOwned(previous => ({ ...previous, identity, file, failed: !file && failed }));
    }, () => {
      if (!controller.signal.aborted) setOwned(previous => ({ ...previous, identity, file: null, failed: true }));
    });
    return () => controller.abort();
  }, [dataset, name, available, mask, identity, current.file, current.attempt]);
  return { file: current.file, failed: current.failed, retry };
}

export function useImageDetailFiles({ dataset, reconstruction, image, matchedImage }: UseImageDetailFilesOptions) {
  const primary = useActiveDetailFile(dataset, reconstruction, image);
  const matched = useActiveDetailFile(dataset, reconstruction, matchedImage);
  const mask = useActiveDetailFile(dataset, reconstruction, image, true);
  return {
    imageFile: primary.file,
    imageSrc: useFileUrl(primary.file),
    maskFile: mask.file,
    maskSrc: useFileUrl(mask.file),
    matchedImageFile: matched.file,
    matchedImageSrc: useFileUrl(matched.file),
    imageFailed: primary.failed,
    maskFailed: mask.failed,
    matchedImageFailed: matched.failed,
    retryImage: primary.retry,
    retryMask: mask.retry,
    retryMatchedImage: matched.retry,
  };
}
