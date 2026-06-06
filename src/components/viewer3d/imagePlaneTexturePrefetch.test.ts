import { describe, expect, it, vi } from 'vitest';
import { buildFile, buildImage, buildReconstruction } from '../../test/builders';
import { prefetchImagePlaneTexturesForReconstruction } from './imagePlaneTexturePrefetch';

describe('prefetchImagePlaneTexturesForReconstruction', () => {
  it('fetches lazy display images and warms the frustum texture cache', async () => {
    const imageA = buildImage({ imageId: 1, name: 'a.jpg' });
    const imageB = buildImage({ imageId: 2, name: 'b.jpg' });
    const fileA = buildFile('a.jpg');
    const fileB = buildFile('b.jpg');
    const reconstruction = buildReconstruction({ images: [imageA, imageB] });
    const dataset = {
      getImageSync: vi.fn(() => undefined),
      getImage: vi.fn(async (name: string) => name === 'a.jpg' ? fileA : fileB),
    };
    const prefetch = vi.fn(async () => undefined);
    const onBatchPrefetched = vi.fn();

    await prefetchImagePlaneTexturesForReconstruction({
      reconstruction,
      dataset,
      shouldCancel: () => false,
      onBatchPrefetched,
      prefetch,
    });

    expect(dataset.getImage).toHaveBeenCalledWith('a.jpg');
    expect(dataset.getImage).toHaveBeenCalledWith('b.jpg');
    expect(prefetch).toHaveBeenCalledWith(
      [
        { file: fileA, name: 'a.jpg' },
        { file: fileB, name: 'b.jpg' },
      ],
      expect.objectContaining({ shouldCancel: expect.any(Function) })
    );
    expect(onBatchPrefetched).toHaveBeenCalledOnce();
  });

  it('uses synchronously cached image files without refetching them', async () => {
    const image = buildImage({ imageId: 1, name: 'cached.jpg' });
    const imageFile = buildFile('cached.jpg');
    const reconstruction = buildReconstruction({ images: [image] });
    const dataset = {
      getImageSync: vi.fn(() => imageFile),
      getImage: vi.fn(),
    };
    const prefetch = vi.fn(async () => undefined);

    await prefetchImagePlaneTexturesForReconstruction({
      reconstruction,
      dataset,
      shouldCancel: () => false,
      prefetch,
    });

    expect(dataset.getImage).not.toHaveBeenCalled();
    expect(prefetch).toHaveBeenCalledWith(
      [{ file: imageFile, name: 'cached.jpg' }],
      expect.objectContaining({ shouldCancel: expect.any(Function) })
    );
  });

  it('falls back to metric image files when display images are unavailable', async () => {
    const image = buildImage({ imageId: 1, name: 'metric-only.jpg' });
    const metricFile = buildFile('metric-only.jpg');
    const reconstruction = buildReconstruction({ images: [image] });
    const dataset = {
      getImageSync: vi.fn(() => undefined),
      getImage: vi.fn(async () => null),
      getMetricImage: vi.fn(async () => metricFile),
    };
    const prefetch = vi.fn(async () => undefined);

    await prefetchImagePlaneTexturesForReconstruction({
      reconstruction,
      dataset,
      shouldCancel: () => false,
      prefetch,
    });

    expect(dataset.getMetricImage).toHaveBeenCalledWith('metric-only.jpg');
    expect(prefetch).toHaveBeenCalledWith(
      [{ file: metricFile, name: 'metric-only.jpg' }],
      expect.objectContaining({ shouldCancel: expect.any(Function) })
    );
  });
});
