import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildImageBitmap } from '../test/builders';
import {
  clearActiveFrustumTextures,
  clearFrustumBitmapCache,
  createFrustumTextureFromBitmap,
  evictOldestFrustumTextures,
  getActiveFrustumTexture,
  getCachedFrustumBitmap,
  getOrCreateFrustumTexture,
  getOrLoadFrustumBitmap,
  type FrustumBitmapCache,
  type FrustumTextureCache,
} from './frustumTextureCache';

describe('frustum texture cache helpers', () => {
  it('reuses cached bitmaps and updates their last-used time', () => {
    const bitmap = createBitmap();
    const cache: FrustumBitmapCache = new Map([
      ['image.jpg', { bitmap, lastUsed: 1 }],
    ]);

    expect(getCachedFrustumBitmap(cache, 'image.jpg', () => 20)).toBe(bitmap);
    expect(cache.get('image.jpg')?.lastUsed).toBe(20);
  });

  it('loads and caches bitmaps from blob URLs', async () => {
    const blob = new Blob(['image']);
    const bitmap = createBitmap();
    const cache: FrustumBitmapCache = new Map();
    const fetchBlob = vi.fn().mockResolvedValue({ blob: vi.fn().mockResolvedValue(blob) });
    const createBitmapFromBlob = vi.fn().mockResolvedValue(bitmap);

    await expect(getOrLoadFrustumBitmap('blob:test', 'image.jpg', cache, {
      fetchBlob,
      createBitmap: createBitmapFromBlob,
      now: () => 42,
    })).resolves.toBe(bitmap);

    expect(fetchBlob).toHaveBeenCalledWith('blob:test');
    expect(createBitmapFromBlob).toHaveBeenCalledWith(blob);
    expect(cache.get('image.jpg')).toEqual({ bitmap, lastUsed: 42 });
  });

  it('creates Three textures from valid bitmaps and stores them as active', () => {
    const cache: FrustumTextureCache = new Map();
    const bitmap = createBitmap();

    const texture = createFrustumTextureFromBitmap(bitmap, 'image.jpg', cache, 50, () => 12);

    expect(texture).toBeInstanceOf(THREE.Texture);
    expect(texture?.image).toBe(bitmap);
    expect(texture?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture?.flipY).toBe(false);
    expect(cache.get('image.jpg')).toEqual({ texture, lastUsed: 12 });
  });

  it('rejects invalid bitmaps without caching a texture', () => {
    const cache: FrustumTextureCache = new Map();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      expect(createFrustumTextureFromBitmap(createBitmap({ width: 0 }), 'bad.jpg', cache)).toBeNull();
      expect(cache.size).toBe(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid bitmap dimensions'));
    } finally {
      warn.mockRestore();
    }
  });

  it('returns active textures and touches their last-used time', () => {
    const texture = new THREE.Texture(createBitmap());
    const cache: FrustumTextureCache = new Map([
      ['image.jpg', { texture, lastUsed: 1 }],
    ]);

    expect(getActiveFrustumTexture(cache, 'image.jpg', () => 30)).toBe(texture);
    expect(cache.get('image.jpg')?.lastUsed).toBe(30);
  });

  it('creates textures from cached bitmaps and starts background bitmap loading on misses', () => {
    const bitmapCache: FrustumBitmapCache = new Map([
      ['cached.jpg', { bitmap: createBitmap(), lastUsed: 1 }],
    ]);
    const activeTextures: FrustumTextureCache = new Map();
    const loadBitmap = vi.fn().mockResolvedValue(null);

    expect(getOrCreateFrustumTexture({
      url: 'blob:cached',
      imageName: 'cached.jpg',
      bitmapCache,
      activeTextures,
      loadBitmap,
      now: () => 10,
    })).toBeInstanceOf(THREE.Texture);

    expect(getOrCreateFrustumTexture({
      url: 'blob:missing',
      imageName: 'missing.jpg',
      bitmapCache,
      activeTextures,
      loadBitmap,
    })).toBeNull();
    expect(loadBitmap).toHaveBeenCalledWith('blob:missing', 'missing.jpg');
  });

  it('evicts the oldest half of active textures when over the active limit', () => {
    const cache: FrustumTextureCache = new Map([
      ['a.jpg', { texture: createTexture(), lastUsed: 1 }],
      ['b.jpg', { texture: createTexture(), lastUsed: 2 }],
      ['c.jpg', { texture: createTexture(), lastUsed: 3 }],
      ['d.jpg', { texture: createTexture(), lastUsed: 4 }],
    ]);

    expect(evictOldestFrustumTextures(cache, 3)).toBe(2);
    expect(Array.from(cache.keys())).toEqual(['c.jpg', 'd.jpg']);
  });

  it('keeps active textures by default so mounted image planes keep valid texture data', () => {
    const cache: FrustumTextureCache = new Map([
      ['a.jpg', { texture: createTexture(), lastUsed: 1 }],
      ['b.jpg', { texture: createTexture(), lastUsed: 2 }],
      ['c.jpg', { texture: createTexture(), lastUsed: 3 }],
      ['d.jpg', { texture: createTexture(), lastUsed: 4 }],
    ]);

    expect(evictOldestFrustumTextures(cache)).toBe(0);
    expect(Array.from(cache.keys())).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
  });

  it('clears active textures and bitmap caches with resource cleanup', () => {
    const texture = createTexture();
    const bitmap = createBitmap();
    const close = vi.spyOn(bitmap, 'close');
    const activeTextures: FrustumTextureCache = new Map([
      ['image.jpg', { texture, lastUsed: 1 }],
    ]);
    const bitmapCache: FrustumBitmapCache = new Map([
      ['image.jpg', { bitmap, lastUsed: 1 }],
    ]);

    clearActiveFrustumTextures(activeTextures);
    clearFrustumBitmapCache(bitmapCache);

    expect(texture.image).not.toBeNull();
    expect(texture.dispose).toHaveBeenCalledOnce();
    expect(activeTextures.size).toBe(0);
    expect(close).toHaveBeenCalledOnce();
    expect(bitmapCache.size).toBe(0);
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
  const texture = new THREE.Texture(createBitmap());
  vi.spyOn(texture, 'dispose').mockImplementation(() => undefined);
  return texture;
}
