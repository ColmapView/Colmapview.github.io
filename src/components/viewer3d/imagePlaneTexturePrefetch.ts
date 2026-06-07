import type { DatasetManager } from '../../dataset';
import type { Reconstruction } from '../../types/colmap';
import { prefetchFrustumTexturesInBackground } from '../../hooks/useFrustumTexture';

export const IMAGE_PLANE_TEXTURE_PREFETCH_COLLECT_BATCH_SIZE = 32;

type ImagePlaneTexturePrefetch = (
  images: Array<{ file: File; name: string }>,
  options: { shouldCancel?: () => boolean }
) => Promise<void>;

interface ImagePlaneTexturePrefetchOptions {
  reconstruction: Reconstruction;
  dataset: Pick<DatasetManager, 'getImage' | 'getImageSync'> & Partial<Pick<DatasetManager, 'getMetricImage'>>;
  shouldCancel: () => boolean;
  onBatchPrefetched?: () => void;
  prefetch?: ImagePlaneTexturePrefetch;
}

async function getImagePlaneTextureSourceFile(
  dataset: ImagePlaneTexturePrefetchOptions['dataset'],
  imageName: string
): Promise<File | null> {
  const metricImageFile = await (dataset.getMetricImage?.(imageName) ?? Promise.resolve(null));
  if (metricImageFile) return metricImageFile;

  const cachedImageFile = dataset.getImageSync(imageName);
  if (cachedImageFile) return cachedImageFile;

  const displayImageFile = await dataset.getImage(imageName);
  if (displayImageFile) return displayImageFile;

  return null;
}

export async function prefetchImagePlaneTexturesForReconstruction({
  reconstruction,
  dataset,
  shouldCancel,
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

    const imageFile = await getImagePlaneTextureSourceFile(dataset, image.name);
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
