import { describe, it, expect } from 'vitest';
import {
  CORE_IMAGE_SOURCE_STRATEGIES,
  imagesDirStrategy,
  resolveImageSource,
  type ImageSourceContribution,
  type ImageSourceStrategy,
} from './imageSourceResolution';

describe('imagesDirStrategy (core)', () => {
  it('resolves a canonical images/ folder as a base-dir contribution', () => {
    expect(
      imagesDirStrategy.resolve({
        filePaths: ['sparse/0/cameras.bin', 'images/a.jpg', 'images/b.jpg'],
        modelDir: 'sparse/0',
      })
    ).toEqual({ kind: 'base-dir', imagesDir: 'images' });
  });

  it('falls back to the most-populated folder for a non-/images layout', () => {
    expect(
      imagesDirStrategy.resolve({
        filePaths: ['colmap/cameras.bin', 'raw/LHS/a.jpg', 'raw/LHS/b.jpg', 'raw/RHS/c.jpg'],
        modelDir: 'colmap',
      })
    ).toEqual({ kind: 'base-dir', imagesDir: 'raw/LHS' });
  });

  it('resolves images at the dataset root as imagesDir = "" (not a decline)', () => {
    expect(
      imagesDirStrategy.resolve({ filePaths: ['cameras.bin', 'a.jpg', 'b.jpg'], modelDir: '' })
    ).toEqual({ kind: 'base-dir', imagesDir: '' });
  });

  it('declines when there are no images', () => {
    expect(
      imagesDirStrategy.resolve({ filePaths: ['colmap/cameras.bin'], modelDir: 'colmap' })
    ).toBeNull();
  });
});

describe('resolveImageSource (merge: override + fallback)', () => {
  const stub = (id: string, contribution: ImageSourceContribution | null): ImageSourceStrategy => ({
    id,
    resolve: () => contribution,
  });

  it('keeps BOTH a per-image override map and the base-dir fallback', async () => {
    const result = await resolveImageSource(
      { filePaths: ['images/0.jpg', 'images/1.jpg'], modelDir: '' },
      [stub('addon', { kind: 'per-image', imageNameToPath: { '0.jpg': 'raw/x.jpg' } }), ...CORE_IMAGE_SOURCE_STRATEGIES]
    );
    // A partial map still resolves unmapped names via the base dir downstream.
    expect(result).toEqual({ imagesDir: 'images', imageNameToPath: { '0.jpg': 'raw/x.jpg' } });
  });

  it('preserves a root base dir ("") through the merge', async () => {
    const result = await resolveImageSource(
      { filePaths: ['cameras.bin', 'a.jpg'], modelDir: '' },
      CORE_IMAGE_SOURCE_STRATEGIES
    );
    expect(result).toEqual({ imagesDir: '' });
  });

  it('ignores an empty per-image contribution', async () => {
    const result = await resolveImageSource(
      { filePaths: ['images/0.jpg'], modelDir: '' },
      [stub('empty', { kind: 'per-image', imageNameToPath: {} }), ...CORE_IMAGE_SOURCE_STRATEGIES]
    );
    expect(result).toEqual({ imagesDir: 'images' });
  });

  it('isolates a throwing strategy and still runs the rest', async () => {
    const throwing: ImageSourceStrategy = {
      id: 'boom',
      resolve: () => {
        throw new Error('strategy failure');
      },
    };
    const result = await resolveImageSource(
      { filePaths: ['images/0.jpg'], modelDir: '' },
      [throwing, ...CORE_IMAGE_SOURCE_STRATEGIES]
    );
    expect(result).toEqual({ imagesDir: 'images' });
  });

  it('returns null when nothing resolves', async () => {
    expect(
      await resolveImageSource(
        { filePaths: ['colmap/cameras.bin'], modelDir: 'colmap' },
        CORE_IMAGE_SOURCE_STRATEGIES
      )
    ).toBeNull();
  });
});
