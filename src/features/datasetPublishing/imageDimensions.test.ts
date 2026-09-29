import { Blob as NodeBlob } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { jpegHeader, pngHeader, webpHeader } from '../../test/imageHeaders';
import { readImageDimensions } from './imageDimensions';

const blob = (bytes: Uint8Array) => new NodeBlob([bytes]) as unknown as Blob;

describe('image dimensions from headers', () => {
  it.each([
    ['PNG', pngHeader(30_000, 20_000), { width: 30_000, height: 20_000 }],
    ['JPEG after an Exif segment', jpegHeader(30_000, 20_000), { width: 30_000, height: 20_000 }],
    ['lossy WebP', webpHeader('VP8', 12_000, 9_000), { width: 12_000, height: 9_000 }],
    ['lossless WebP', webpHeader('VP8L', 12_000, 9_000), { width: 12_000, height: 9_000 }],
    ['extended WebP', webpHeader('VP8X', 30_000, 20_000), { width: 30_000, height: 20_000 }],
  ])('reads %s dimensions without decoding pixels', async (_format, bytes, expected) => {
    await expect(readImageDimensions(blob(bytes))).resolves.toEqual(expected);
  });

  it.each([
    ['unrecognized bytes', new TextEncoder().encode('not an image at all, just text')],
    ['a truncated PNG', pngHeader(10, 10).slice(0, 20)],
    ['a JPEG without a frame header', new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
    ['a zero-sized PNG', pngHeader(0, 10)],
  ])('returns null for %s', async (_case, bytes) => {
    await expect(readImageDimensions(blob(bytes))).resolves.toBeNull();
  });
});
