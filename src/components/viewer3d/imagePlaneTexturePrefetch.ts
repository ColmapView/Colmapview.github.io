import type { DatasetAccessOptions, DatasetManager } from '../../dataset';
import type { Reconstruction } from '../../types/colmap';
import { prefetchFrustumTexturesInBackground } from '../../hooks/useFrustumTexture';

export const IMAGE_PLANE_TEXTURE_PREFETCH_COLLECT_BATCH_SIZE = 32;

type ImagePlaneTexturePrefetch = (
  images: Array<{ file: File; name: string }>,
  options: { shouldCancel?: () => boolean }
) => Promise<void>;

export type ImagePlaneTextureDataset =
  Partial<Pick<DatasetManager, 'getImage' | 'getImageSync' | 'getMetricImage'>>;

interface ImagePlaneTexturePrefetchOptions {
  reconstruction: Reconstruction;
  dataset: ImagePlaneTextureDataset;
  shouldCancel: () => boolean;
  signal?: AbortSignal;
  onBatchPrefetched?: () => void;
  prefetch?: ImagePlaneTexturePrefetch;
}

export async function getImagePlaneTextureSourceFile(
  dataset: ImagePlaneTextureDataset,
  imageName: string,
  options?: DatasetAccessOptions
): Promise<File | null> {
  const cachedImageFile = dataset.getImageSync?.(imageName);
  if (cachedImageFile) return cachedImageFile;

  if (options?.signal?.aborted) return null;
  const displayImageFile = await ((options ? dataset.getImage?.(imageName, options) : dataset.getImage?.(imageName)) ?? Promise.resolve(null));
  if (displayImageFile) return displayImageFile;

  if (options?.signal?.aborted) return null;
  const metricImageFile = await ((options ? dataset.getMetricImage?.(imageName, options) : dataset.getMetricImage?.(imageName)) ?? Promise.resolve(null));
  if (metricImageFile) return metricImageFile;

  return null;
}

export async function prefetchImagePlaneTexturesForReconstruction({
  reconstruction,
  dataset,
  shouldCancel,
  signal,
  onBatchPrefetched,
  prefetch = prefetchFrustumTexturesInBackground,
}: ImagePlaneTexturePrefetchOptions): Promise<void> {
  let batch: Array<{ file: File; name: string }> = [];

  const flushBatch = async () => {
    if (batch.length === 0 || shouldCancel()) {
      batch = [];
      return;
    }

    const nextBatch = batch;
    batch = [];
    await prefetch(nextBatch, { shouldCancel });
    if (!shouldCancel()) {
      onBatchPrefetched?.();
    }
  };

  for (const image of reconstruction.images.values()) {
    if (shouldCancel()) {
      return;
    }

    const imageFile = await getImagePlaneTextureSourceFile(dataset, image.name, { signal, priority: 'prefetch' });
    if (shouldCancel()) {
      return;
    }
    if (!imageFile) {
      continue;
    }

    batch.push({ file: imageFile, name: image.name });
    if (batch.length >= IMAGE_PLANE_TEXTURE_PREFETCH_COLLECT_BATCH_SIZE) {
      await flushBatch();
    }
  }

  await flushBatch();
}
