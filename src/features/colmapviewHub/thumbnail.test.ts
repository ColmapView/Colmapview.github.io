import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { coverCrop, makeHubThumbnail, stripJpegMetadata } from './thumbnail';
import { bytesToBase64 } from '../../utils/base64';

const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload];
const ascii = (text: string) => [...text].map(character => character.charCodeAt(0));
const jpeg = (...segments: number[][]) => new Uint8Array([0xff, 0xd8, ...segments.flat(), 0x12, 0x34, 0x56, 0xff, 0xd9]);
const app0 = segment(0xe0, ascii('JFIF\0'));
const exif = segment(0xe1, [...ascii('Exif\0\0'), 1, 2, 3, 4]);
const comment = segment(0xfe, ascii('camera serial 123'));
const frame = segment(0xc0, [8, 0x01, 0x3b, 0x02, 0x58, 3]);
const scan = segment(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]);
/** A JPEG that is `size` bytes once its metadata is stripped: an APP2 segment pads it, as an ICC profile would. */
const padded = (size: number, ...metadata: number[][]) => jpeg(app0, ...metadata, segment(0xe2, new Array<number>(size - 44).fill(0)), frame, scan);

describe('coverCrop', () => {
  it('crops the sides of a wide image', () => {
    const crop = coverCrop(1200, 300);
    expect(crop.height).toBeCloseTo(300);
    expect(crop.width).toBeCloseTo(300 * 600 / 315);
    expect(crop.x).toBeCloseTo((1200 - crop.width) / 2);
    expect(crop.y).toBeCloseTo(0);
  });

  it('crops the top and bottom of a tall image', () => {
    const crop = coverCrop(300, 1200);
    expect(crop.width).toBe(300);
    expect(crop.height).toBeCloseTo(300 * 315 / 600);
    expect(crop.y).toBeCloseTo((1200 - crop.height) / 2);
  });

  it('keeps an image that already has the card shape', () => {
    expect(coverCrop(1200, 630)).toEqual({ x: 0, y: 0, width: 1200, height: 630 });
  });
});

describe('stripJpegMetadata', () => {
  it('removes EXIF and comment segments and keeps everything else in order', () => {
    expect([...stripJpegMetadata(jpeg(app0, exif, comment, frame, scan))]).toEqual([...jpeg(app0, frame, scan)]);
  });

  it('returns the same bytes when there is no metadata', () => {
    const clean = jpeg(app0, frame, scan);
    expect(stripJpegMetadata(clean)).toBe(clean);
  });

  it('leaves malformed data alone for the Hub to reject', () => {
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2]);
    expect(stripJpegMetadata(broken)).toBe(broken);
  });

  it('skips fill bytes before a marker, as the Hub does', () => {
    const filled = jpeg(app0, [0xff, ...exif], [0xff, 0xff, ...comment], [0xff, ...frame], scan);
    expect([...stripJpegMetadata(filled)]).toEqual([...jpeg(app0, [0xff, ...frame], scan)]);
  });
});

describe('bytesToBase64', () => {
  it('encodes large buffers in chunks', () => {
    const bytes = new Uint8Array(100 * 1024).map((_, index) => index % 251);
    expect(Uint8Array.from(atob(bytesToBase64(bytes)), character => character.charCodeAt(0))).toEqual(bytes);
  });
});

describe('makeHubThumbnail', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('fills a white 600 × 315 canvas, draws the crop over it, and sends the first encoding that fits 64 KiB once stripped', async () => {
    const bitmap = { width: 1200, height: 300, close: vi.fn() };
    const calls: string[] = [];
    const drawImage = vi.fn(() => { calls.push('draw'); });
    const context = { fillStyle: '', fillRect: vi.fn(() => { calls.push(`fill ${context.fillStyle}`); }), drawImage };
    const encodings: unknown[][] = [];
    const canvas = {
      width: 0, height: 0, getContext: () => context,
      // EXIF and the comment add 35 bytes: neither encoding fits with them, and only the second fits without them.
      toBlob(done: BlobCallback, type: string, quality: number) {
        encodings.push([type, quality, this.width, this.height]);
        done(new NodeBlob([padded(quality > 0.65 ? 64 * 1024 + 1 : 64 * 1024, exif, comment)]) as unknown as Blob);
      },
    };
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement);
    const sent = await makeHubThumbnail(new Blob());
    const crop = coverCrop(1200, 300);
    expect(context.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 600, 315);
    expect(calls).toEqual(['fill #ffffff', 'draw']);
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, 600, 315);
    expect(encodings).toEqual([['image/jpeg', 0.7, 600, 315], ['image/jpeg', 0.6, 600, 315]]);
    expect(sent).toBe(bytesToBase64(padded(64 * 1024)));
    expect(atob(sent)).toHaveLength(64 * 1024);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvas).toMatchObject({ width: 1, height: 1 });
  });
});
