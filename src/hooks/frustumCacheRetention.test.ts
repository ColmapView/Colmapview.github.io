import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createFrustumCacheRetention, estimateFrustumTextureBytes } from './frustumCacheRetention';
import { createFrustumTextureFromBitmap, type FrustumBitmapCache, type FrustumTextureCache } from './frustumTextureCache';
import { buildImageBitmap } from '../test/builders';

function setup() {
  const bitmaps: FrustumBitmapCache = new Map();
  const textures: FrustumTextureCache = new Map();
  const cache = createFrustumCacheRetention(bitmaps, textures, { bitmapBytes: 16, textureBytes: 20 });
  const add = (name: string) => {
    const bitmap = buildImageBitmap({ width: 2, height: 2 });
    const close = vi.spyOn(bitmap, 'close');
    cache.storeBitmap(name, bitmap);
    const texture = createFrustumTextureFromBitmap(bitmap, name, textures)!;
    const dispose = vi.spyOn(texture, 'dispose');
    cache.noteTexture(name);
    return { bitmap, close, texture, dispose };
  };
  return { bitmaps, textures, cache, add };
}

describe('frustum bitmap and texture ownership', () => {
  it('accounts for actual dimensions including generated mipmaps', () => {
    const texture = new THREE.Texture({ width: 4, height: 2 } as ImageBitmap);
    expect(estimateFrustumTextureBytes(texture)).toBe(32 + 8 + 4);
    texture.generateMipmaps = false;
    expect(estimateFrustumTextureBytes(texture)).toBe(32);
  });

  it('evicts inactive resources in LRU order and disposes texture before its bitmap', () => {
    const { cache, add, bitmaps } = setup();
    const first = add('old');
    bitmaps.get('old')!.lastUsed = 1;
    const second = add('new');
    cache.trim();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(first.close).toHaveBeenCalledOnce();
    expect(first.dispose.mock.invocationCallOrder[0]).toBeLessThan(first.close.mock.invocationCallOrder[0]);
    expect(second.close).not.toHaveBeenCalled();
    expect(cache.getStats()).toMatchObject({ inactiveBitmapBytes: 16, inactiveTextureBytes: 20 });
  });

  it('pins shared materials until their last lease releases, separately from inactive budget', () => {
    const { cache, add } = setup();
    const releaseA = cache.acquire('selected');
    const releaseB = cache.acquire('selected');
    const selected = add('selected');
    add('background');
    cache.trim();
    releaseA();
    expect(selected.dispose).not.toHaveBeenCalled();
    expect(cache.getStats()).toMatchObject({ pinnedBitmapBytes: 16, pinnedTextureBytes: 20 });
    releaseB();
    releaseB();
    expect(cache.getStats().pinnedBitmapBytes).toBe(0);
    expect(cache.getStats().inactiveBitmapBytes).toBeLessThanOrEqual(16);
  });

  it('retires cleared resources until detach without confusing new same-name leases', () => {
    const { cache, add } = setup();
    const releaseOld = cache.acquire('same');
    const old = add('same');
    cache.clear();
    expect(old.close).not.toHaveBeenCalled();
    expect(cache.getStats().retiredBytes).toBe(36);
    const releaseNew = cache.acquire('same');
    const current = add('same');
    releaseOld();
    expect(old.close).toHaveBeenCalledOnce();
    expect(current.close).not.toHaveBeenCalled();
    expect(cache.getStats()).toMatchObject({ retiredBytes: 0, pinnedBitmapBytes: 16 });
    releaseNew();
    cache.clear();
    expect(current.close).toHaveBeenCalledOnce();
  });

  it('keeps retention bounded across repeated visits and releases every resource once', () => {
    const { cache, add } = setup();
    const resources: ReturnType<typeof add>[] = [];
    let releasePrevious = () => {};
    for (let visit = 0; visit < 100; visit++) {
      const name = `image-${visit % 20}`;
      const releaseCurrent = cache.acquire(name);
      resources.push(add(name));
      releasePrevious();
      cache.trim();
      const stats = cache.getStats();
      expect(stats.pinnedBitmapBytes).toBe(16);
      expect(stats.pinnedTextureBytes).toBe(20);
      expect(stats.inactiveBitmapBytes).toBeLessThanOrEqual(16);
      expect(stats.inactiveTextureBytes).toBeLessThanOrEqual(20);
      expect(stats.retiredBytes).toBe(0);
      releasePrevious = releaseCurrent;
    }
    releasePrevious();
    cache.clear();
    for (const resource of resources) {
      expect(resource.close).toHaveBeenCalledOnce();
      expect(resource.dispose).toHaveBeenCalledOnce();
    }
  });
});
