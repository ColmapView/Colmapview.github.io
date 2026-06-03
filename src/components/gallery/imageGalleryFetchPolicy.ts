export type ImageGalleryFetchViewMode = 'gallery' | 'list';

export const IMAGE_GALLERY_FETCH_BATCH_SIZE = 5;

interface GalleryFetchImage {
  name: string;
}

interface CollectVisibleImageNamesOptions {
  viewMode: ImageGalleryFetchViewMode;
  rows: GalleryFetchImage[][];
  images: GalleryFetchImage[];
  visibleIndexes: number[];
  hasCachedImage: (imageName: string) => boolean;
}

interface FetchImageNamesInBatchesOptions {
  imageNames: string[];
  batchSize?: number;
  getImage: (imageName: string) => Promise<File | null>;
  onBatchLoaded: () => void;
  shouldCancel?: () => boolean;
}

export function collectVisibleImageNames({
  viewMode,
  rows,
  images,
  visibleIndexes,
  hasCachedImage,
}: CollectVisibleImageNamesOptions): string[] {
  const toFetch: string[] = [];

  for (const index of visibleIndexes) {
    const rowImages = viewMode === 'gallery'
      ? rows[index] ?? []
      : [images[index]].filter((image): image is GalleryFetchImage => Boolean(image));

    for (const image of rowImages) {
      if (!hasCachedImage(image.name)) {
        toFetch.push(image.name);
      }
    }
  }

  return Array.from(new Set(toFetch));
}

export async function fetchImageNamesInBatches({
  imageNames,
  batchSize = IMAGE_GALLERY_FETCH_BATCH_SIZE,
  getImage,
  onBatchLoaded,
  shouldCancel = () => false,
}: FetchImageNamesInBatchesOptions): Promise<void> {
  for (let i = 0; i < imageNames.length && !shouldCancel(); i += batchSize) {
    const batch = imageNames.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((name) => getImage(name)));

    if (!shouldCancel() && results.some((file) => file !== null)) {
      onBatchLoaded();
    }
  }
}
