import type { Texture } from 'three';
import { disposeDetachedFrustumTexture, type FrustumBitmapCache, type FrustumTextureCache } from './frustumTextureCache';

export interface FrustumRetentionBudgets {
  bitmapBytes: number;
  textureBytes: number;
}

export const FRUSTUM_RETENTION_BUDGETS: FrustumRetentionBudgets = {
  bitmapBytes: 64 * 1024 * 1024,
  textureBytes: 128 * 1024 * 1024,
};

export function estimateBitmapBytes(bitmap: Pick<ImageBitmap, 'width' | 'height'>): number {
  return bitmap.width * bitmap.height * 4;
}

export function estimateFrustumTextureBytes(texture: Texture): number {
  const bitmap = texture.image as ImageBitmap;
  let width = bitmap.width;
  let height = bitmap.height;
  let bytes = width * height * 4;
  if (texture.generateMipmaps) {
    while (width > 1 || height > 1) {
      width = Math.max(1, Math.floor(width / 2));
      height = Math.max(1, Math.floor(height / 2));
      bytes += width * height * 4;
    }
  }
  return bytes;
}

/** Leases belong to a dataset generation, and survive cache clear until detach. */
export function createFrustumCacheRetention(
  bitmaps: FrustumBitmapCache,
  textures: FrustumTextureCache,
  budgets: FrustumRetentionBudgets = FRUSTUM_RETENTION_BUDGETS,
) {
  let generation = 0;
  let bitmapBytes = 0;
  let textureBytes = 0;
  let pinnedBitmapBytes = 0;
  let pinnedTextureBytes = 0;
  let evictions = 0;
  const pins = new Map<string, number>();
  const retired = new Map<string, { bitmap?: ImageBitmap; texture?: Texture }>();
  const keyFor = (name: string) => `${generation}\n${name}`;
  const isPinned = (name: string) => (pins.get(keyFor(name)) ?? 0) > 0;
  const dispose = (entry: { bitmap?: ImageBitmap; texture?: Texture }) => {
    if (entry.texture) disposeDetachedFrustumTexture(entry.texture);
    entry.bitmap?.close();
  };
  function removeTexture(name: string) {
    const entry = textures.get(name);
    if (!entry) return;
    textureBytes -= estimateFrustumTextureBytes(entry.texture);
    disposeDetachedFrustumTexture(entry.texture);
    textures.delete(name);
  }
  function trim() {
    if (textureBytes - pinnedTextureBytes > budgets.textureBytes) {
      const inactive = [...textures].filter(([name]) => !isPinned(name)).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      for (const [name] of inactive) {
        if (textureBytes - pinnedTextureBytes <= budgets.textureBytes) break;
        removeTexture(name);
        evictions++;
      }
    }
    if (bitmapBytes - pinnedBitmapBytes > budgets.bitmapBytes) {
      const inactive = [...bitmaps].filter(([name]) => !isPinned(name)).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      for (const [name, { bitmap }] of inactive) {
        if (bitmapBytes - pinnedBitmapBytes <= budgets.bitmapBytes) break;
        // Even an inactive texture must be detached before closing its source.
        removeTexture(name);
        bitmapBytes -= estimateBitmapBytes(bitmap);
        bitmap.close();
        bitmaps.delete(name);
        evictions++;
      }
    }
  }
  return {
    trim,
    acquire(name: string): () => void {
      const key = keyFor(name);
      const count = pins.get(key) ?? 0;
      pins.set(key, count + 1);
      if (count === 0) {
        const bitmap = bitmaps.get(name)?.bitmap;
        const texture = textures.get(name)?.texture;
        if (bitmap) pinnedBitmapBytes += estimateBitmapBytes(bitmap);
        if (texture) pinnedTextureBytes += estimateFrustumTextureBytes(texture);
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const remaining = (pins.get(key) ?? 1) - 1;
        if (remaining > 0) { pins.set(key, remaining); return; }
        pins.delete(key);
        if (key !== keyFor(name)) {
          const entry = retired.get(key);
          if (entry) { dispose(entry); retired.delete(key); }
          return;
        }
        const bitmap = bitmaps.get(name)?.bitmap;
        const texture = textures.get(name)?.texture;
        if (bitmap) pinnedBitmapBytes -= estimateBitmapBytes(bitmap);
        if (texture) pinnedTextureBytes -= estimateFrustumTextureBytes(texture);
        trim();
      };
    },
    storeBitmap(name: string, bitmap: ImageBitmap) {
      bitmaps.set(name, { bitmap, lastUsed: Date.now() });
      bitmapBytes += estimateBitmapBytes(bitmap);
      if (isPinned(name)) pinnedBitmapBytes += estimateBitmapBytes(bitmap);
      // Run after consumers of this completion have a chance to acquire a lease.
    },
    noteTexture(name: string) {
      const texture = textures.get(name)?.texture;
      if (!texture) return;
      textureBytes += estimateFrustumTextureBytes(texture);
      if (isPinned(name)) pinnedTextureBytes += estimateFrustumTextureBytes(texture);
    },
    clear() {
      for (const name of new Set([...bitmaps.keys(), ...textures.keys()])) {
        const entry = { bitmap: bitmaps.get(name)?.bitmap, texture: textures.get(name)?.texture };
        if (isPinned(name)) retired.set(keyFor(name), entry);
        else dispose(entry);
      }
      generation++;
      bitmaps.clear();
      textures.clear();
      bitmapBytes = textureBytes = pinnedBitmapBytes = pinnedTextureBytes = 0;
    },
    getStats() {
      let retiredBytes = 0;
      for (const entry of retired.values()) {
        if (entry.bitmap) retiredBytes += estimateBitmapBytes(entry.bitmap);
        if (entry.texture) retiredBytes += estimateFrustumTextureBytes(entry.texture);
      }
      return {
        bitmapBytes, textureBytes, pinnedBitmapBytes, pinnedTextureBytes,
        inactiveBitmapBytes: bitmapBytes - pinnedBitmapBytes,
        inactiveTextureBytes: textureBytes - pinnedTextureBytes,
        retiredBytes, evictions, bitmapBudgetBytes: budgets.bitmapBytes, textureBudgetBytes: budgets.textureBytes,
      };
    },
  };
}
