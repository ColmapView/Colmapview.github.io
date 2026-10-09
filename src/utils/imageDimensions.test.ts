import { Blob as NodeBlob } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { bmpHeader, gifHeader, jpegExifHeader, jpegHeader, pngHeader, tiffHeader, webpHeader } from '../test/imageHeaders';
import { readImageDimensions } from './imageDimensions';

const blob = (bytes: Uint8Array<ArrayBuffer>) => new NodeBlob([bytes]) as unknown as Blob;

describe('image dimensions from headers', () => {
  it.each([
    ['PNG', pngHeader(30_000, 20_000), { width: 30_000, height: 20_000 }],
    ['JPEG after an Exif segment', jpegHeader(30_000, 20_000), { width: 30_000, height: 20_000 }],
    ['lossy WebP', webpHeader('VP8', 12_000, 9_000), { width: 12_000, height: 9_000 }],
    ['lossless WebP', webpHeader('VP8L', 12_000, 9_000), { width: 12_000, height: 9_000 }],
    ['extended WebP', webpHeader('VP8X', 30_000, 20_000), { width: 30_000, height: 20_000 }],
    ['GIF', gifHeader(30_000, 20_000), { width: 30_000, height: 20_000 }],
    ['BMP', bmpHeader(30_000, 20_000), { width: 30_000, height: 20_000 }],
    ['top-down BMP', bmpHeader(30_000, -20_000), { width: 30_000, height: 20_000 }],
    ['little-endian TIFF', tiffHeader(30_000, 20_000), { width: 30_000, height: 20_000 }],
    ['big-endian TIFF', tiffHeader(30_000, 20_000, 1, false), { width: 30_000, height: 20_000 }],
  ])('reads %s dimensions without decoding pixels', async (_format, bytes, expected) => {
    await expect(readImageDimensions(blob(bytes))).resolves.toEqual(expected);
  });
  it.each([jpegExifHeader(1600, 800, 6), tiffHeader(1600, 800, 8)])('applies display orientation only when requested', async bytes => {
    await expect(readImageDimensions(blob(bytes))).resolves.toEqual({ width: 1600, height: 800 });
    await expect(readImageDimensions(blob(bytes), { applyOrientation: true })).resolves.toEqual({ width: 800, height: 1600 });
  });
  it('reads PNG orientation before pixel chunks and keeps WebP canvas dimensions independent of Exif', async () => {
    const exif = tiffHeader(1600, 800, 6);
    const png = pngHeader(1600, 800), pngChunk = new Uint8Array(12 + exif.length);
    new DataView(pngChunk.buffer).setUint32(0, exif.length); pngChunk.set(new TextEncoder().encode('eXIf'), 4); pngChunk.set(exif, 8);
    await expect(readImageDimensions(new NodeBlob([png, new Uint8Array(4), pngChunk]) as unknown as Blob, { applyOrientation: true }))
      .resolves.toEqual({ width: 800, height: 1600 });
    const idat = new Uint8Array(12); idat.set(new TextEncoder().encode('IDAT'), 4);
    await expect(readImageDimensions(new NodeBlob([png, new Uint8Array(4), idat, pngChunk]) as unknown as Blob, { applyOrientation: true }))
      .resolves.toEqual({ width: 1600, height: 800 });
    const webp = webpHeader('VP8X', 1600, 800); webp[20] |= 8;
    const webpChunk = new Uint8Array(14 + exif.length);
    webpChunk.set(new TextEncoder().encode('EXIF')); new DataView(webpChunk.buffer).setUint32(4, exif.length + 6, true);
    webpChunk.set(new TextEncoder().encode('Exif\0\0'), 8); webpChunk.set(exif, 14);
    await expect(readImageDimensions(new NodeBlob([webp, webpChunk]) as unknown as Blob, { applyOrientation: true }))
      .resolves.toEqual({ width: 1600, height: 800 });
  });
  it('bounds malformed TIFF offsets and metadata tables without reading image bodies', async () => {
    const bytes = tiffHeader(10, 10), view = new DataView(bytes.buffer);
    view.setUint32(4, 0xffffffff, true);
    await expect(readImageDimensions(blob(bytes))).resolves.toBeNull();
    view.setUint32(4, 8, true); view.setUint16(8, 65535, true);
    await expect(readImageDimensions(blob(bytes))).resolves.toBeNull();
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
