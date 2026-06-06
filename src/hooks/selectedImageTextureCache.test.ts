import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildImageBitmap } from '../test/builders';
import {
  clearSelectedImageTextureCache,
  createSelectedImageTextureFromBitmap,
  disposeSelectedImageTextureEntry,
  getSelectedImageTexture,
  replaceSelectedImageTexture,
} from './selectedImageTextureCache';

describe('selected image texture cache helpers', () => {
  afterEach(() => {
    clearSelectedImageTextureCache();
  });

  it('creates high-resolution Three textures from bitmaps', () => {
    const bitmap = createBitmap();

    const texture = createSelectedImageTextureFromBitmap(bitmap);

    expect(texture).toBeInstanceOf(THREE.Texture);
    expect(texture.image).toBe(bitmap);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.flipY).toBe(false);
  });

  it('returns only the selected image texture for matching names', () => {
    const texture = createTexture();

    replaceSelectedImageTexture('selected.jpg', texture);

    expect(getSelectedImageTexture('selected.jpg')).toBe(texture);
    expect(getSelectedImageTexture('other.jpg')).toBeNull();
  });

  it('disposes the previous selected texture when replacing it', () => {
    const firstBitmap = createBitmap();
    const firstTexture = createSelectedImageTextureFromBitmap(firstBitmap);
    const firstDispose = vi.spyOn(firstTexture, 'dispose').mockImplementation(() => undefined);
    const secondTexture = createTexture();

    replaceSelectedImageTexture('first.jpg', firstTexture);
    replaceSelectedImageTexture('second.jpg', secondTexture);

    expect(firstBitmap.close).toHaveBeenCalledOnce();
    expect(firstTexture.image).not.toBeNull();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(getSelectedImageTexture('first.jpg')).toBeNull();
    expect(getSelectedImageTexture('second.jpg')).toBe(secondTexture);
  });

  it('clears the selected texture cache with resource cleanup', () => {
    const bitmap = createBitmap();
    const texture = createSelectedImageTextureFromBitmap(bitmap);
    const dispose = vi.spyOn(texture, 'dispose').mockImplementation(() => undefined);

    replaceSelectedImageTexture('selected.jpg', texture);
    clearSelectedImageTextureCache();
    clearSelectedImageTextureCache();

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(texture.image).not.toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
    expect(getSelectedImageTexture('selected.jpg')).toBeNull();
  });

  it('disposes selected texture entries without stored bitmaps', () => {
    const texture = createTexture();
    const dispose = vi.spyOn(texture, 'dispose').mockImplementation(() => undefined);

    disposeSelectedImageTextureEntry({ name: 'selected.jpg', texture });

    expect(texture.image).not.toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
  });
});

function createBitmap(overrides: Partial<ImageBitmap> = {}): ImageBitmap {
  return buildImageBitmap({
    width: 64,
    height: 32,
    close: vi.fn(),
    ...overrides,
  });
}

function createTexture(): THREE.Texture {
  return new THREE.Texture(createBitmap());
}
