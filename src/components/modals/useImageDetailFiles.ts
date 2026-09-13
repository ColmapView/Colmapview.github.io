import { useEffect, useMemo, useState } from 'react';
import type { DatasetManager } from '../../dataset';
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
): File | null {
  const name = image?.name;
  const imageId = image?.imageId;
  const available = mask ? dataset.hasMasks() : dataset.hasImages();
  const identity = useMemo(() => ({ dataset, reconstruction, name, imageId, mask, available }),
    [dataset, reconstruction, name, imageId, mask, available]);
  const readCached = () => name && available
    ? (mask ? dataset.getMaskSync(name) : dataset.getImageSync(name)) ?? null : null;
  const [owned, setOwned] = useState(() => ({ identity, file: readCached() }));
  // Updating derived state during render releases the old resource before it can be displayed
  // under a new reconstruction/name, and snapshots synchronous hits before async work evicts them.
  let current = owned;
  if (owned.identity !== identity) {
    current = { identity, file: readCached() };
    setOwned(current);
  }

  useEffect(() => {
    if (!name || !available || current.file) return;
    const controller = new AbortController();
    const access = { signal: controller.signal, priority: 'selected' } as const;
    const pending = mask ? dataset.getMask(name, access) : dataset.getImage(name, access);
    void pending.then(file => {
      if (!controller.signal.aborted) setOwned({ identity, file });
    });
    return () => controller.abort();
  }, [dataset, name, available, mask, identity, current.file]);
  return current.file;
}

export function useImageDetailFiles({ dataset, reconstruction, image, matchedImage }: UseImageDetailFilesOptions) {
  const imageFile = useActiveDetailFile(dataset, reconstruction, image);
  const matchedImageFile = useActiveDetailFile(dataset, reconstruction, matchedImage);
  const maskFile = useActiveDetailFile(dataset, reconstruction, image, true);
  return {
    imageFile,
    imageSrc: useFileUrl(imageFile),
    maskFile,
    maskSrc: useFileUrl(maskFile),
    matchedImageFile,
    matchedImageSrc: useFileUrl(matchedImageFile),
  };
}
