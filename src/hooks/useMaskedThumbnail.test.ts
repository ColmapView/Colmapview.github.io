import { describe, expect, it } from 'vitest';
import { applyMaskAlphaToImagePixels } from './useMaskedThumbnail';

describe('masked thumbnail helpers', () => {
  it('uses opaque mask luminance as output image alpha', () => {
    const imagePixels = new Uint8ClampedArray([
      10, 20, 30, 255,
      40, 50, 60, 255,
      70, 80, 90, 255,
    ]);
    const maskPixels = new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 255,
      128, 128, 128, 255,
    ]);

    applyMaskAlphaToImagePixels(imagePixels, maskPixels);

    expect(imagePixels[3]).toBe(0);
    expect(imagePixels[7]).toBe(255);
    expect(imagePixels[11]).toBe(128);
  });

  it('uses mask alpha when the mask file already has transparency', () => {
    const imagePixels = new Uint8ClampedArray([
      10, 20, 30, 255,
      40, 50, 60, 128,
    ]);
    const maskPixels = new Uint8ClampedArray([
      0, 0, 0, 64,
      255, 255, 255, 128,
    ]);

    applyMaskAlphaToImagePixels(imagePixels, maskPixels);

    expect(imagePixels[3]).toBe(64);
    expect(imagePixels[7]).toBe(64);
  });

  it('uses inverse mask alpha for inverse masked thumbnails', () => {
    const imagePixels = new Uint8ClampedArray([
      10, 20, 30, 255,
      40, 50, 60, 255,
      70, 80, 90, 128,
    ]);
    const maskPixels = new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 255,
      128, 128, 128, 255,
    ]);

    applyMaskAlphaToImagePixels(imagePixels, maskPixels, true);

    expect(imagePixels[3]).toBe(255);
    expect(imagePixels[7]).toBe(0);
    expect(imagePixels[11]).toBe(64);
  });
});
