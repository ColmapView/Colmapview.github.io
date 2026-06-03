import { describe, expect, it, vi } from 'vitest';
import { buildFile, buildImage } from '../../test/builders';
import {
  collectVisibleImageNames,
  fetchImageNamesInBatches,
} from './imageGalleryFetchPolicy';

describe('image gallery fetch policy', () => {
  it('collects uncached visible gallery row image names once', () => {
    const rows = [
      [
        buildImage({ imageId: 1, name: 'a.jpg' }),
        buildImage({ imageId: 2, name: 'b.jpg' }),
      ],
      [
        buildImage({ imageId: 3, name: 'b.jpg' }),
        buildImage({ imageId: 4, name: 'c.jpg' }),
      ],
    ];

    expect(collectVisibleImageNames({
      viewMode: 'gallery',
      rows,
      images: rows.flat(),
      visibleIndexes: [0, 1, 99],
      hasCachedImage: (name) => name === 'a.jpg',
    })).toEqual(['b.jpg', 'c.jpg']);
  });

  it('collects uncached visible list image names by row index', () => {
    const images = [
      buildImage({ imageId: 1, name: 'a.jpg' }),
      buildImage({ imageId: 2, name: 'b.jpg' }),
      buildImage({ imageId: 3, name: 'c.jpg' }),
    ];

    expect(collectVisibleImageNames({
      viewMode: 'list',
      rows: [],
      images,
      visibleIndexes: [0, 2, 10],
      hasCachedImage: (name) => name === 'c.jpg',
    })).toEqual(['a.jpg']);
  });

  it('fetches names in batches and reports only loaded batches', async () => {
    const getImage = vi.fn(async (name: string) => name.endsWith('2.jpg') ? null : buildFile(name));
    const onBatchLoaded = vi.fn();

    await fetchImageNamesInBatches({
      imageNames: ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg'],
      batchSize: 2,
      getImage,
      onBatchLoaded,
    });

    expect(getImage.mock.calls.map(([name]) => name)).toEqual(['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg']);
    expect(onBatchLoaded).toHaveBeenCalledTimes(3);
  });

  it('stops before the next batch when cancelled', async () => {
    let cancelled = false;
    const getImage = vi.fn(async (name: string) => {
      cancelled = true;
      return buildFile(name);
    });
    const onBatchLoaded = vi.fn();

    await fetchImageNamesInBatches({
      imageNames: ['1.jpg', '2.jpg', '3.jpg'],
      batchSize: 1,
      getImage,
      onBatchLoaded,
      shouldCancel: () => cancelled,
    });

    expect(getImage).toHaveBeenCalledOnce();
    expect(onBatchLoaded).not.toHaveBeenCalled();
  });
});
