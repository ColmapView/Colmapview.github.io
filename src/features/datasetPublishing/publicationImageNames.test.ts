import { describe, expect, it } from 'vitest';
import { buildImage } from '../../test/builders';
import { publicationJpegNames } from './publicationImageNames';

describe('publication JPEG names', () => {
  it('keeps JPEG names and avoids merging PNG/WebP files with an existing JPEG of the same basename', () => {
    const names = ['photo.png', 'photo.jpg', 'photo.png.jpg', 'nested/photo.webp', 'nested/photo.png', 'nested/photo.jpeg'];
    const images = new Map(names.map((name, index) => [index + 1, buildImage({ imageId: index + 1, name })]));
    const result = publicationJpegNames(images);
    expect([...result.values()]).toEqual(['photo.png-2.jpg', 'photo.jpg', 'photo.png.jpg', 'nested/photo.jpg', 'nested/photo.png.jpg', 'nested/photo.jpeg']);
    expect([...images.values()].map(image => image.name)).toEqual(names);
    expect(new Set(result.values()).size).toBe(names.length);
  });
  it('maps repeated image references to one file and preserves directories with dots', () => {
    const images = new Map([ [1, buildImage({ name: 'set.v2/拍照.png' })], [2, buildImage({ imageId: 2, name: 'set.v2/拍照.png' })],
      [3, buildImage({ imageId: 3, name: 'set.v2/no-extension' })] ]);
    expect([...publicationJpegNames(images).values()]).toEqual(['set.v2/拍照.jpg', 'set.v2/拍照.jpg', 'set.v2/no-extension.jpg']);
  });
  it('does not introduce case-only collisions when ZIPs are extracted on Windows', () => {
    const images = new Map([[1, buildImage({ name: 'Photo.JPG' })], [2, buildImage({ imageId: 2, name: 'photo.png' })]]);
    expect([...publicationJpegNames(images).values()]).toEqual(['Photo.JPG', 'photo.png.jpg']);
  });
});
