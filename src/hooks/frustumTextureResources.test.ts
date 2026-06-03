import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildImageBitmap } from '../test/builders';
import {
  createFrustumTextureResource,
  createSelectedImageTextureResource,
  getFrustumTextureCacheKey,
  getSelectedImageTextureCacheKey,
  type FrustumTextureResource,
  type SelectedImageTextureResource,
  type TextureSnapshot,
} from './frustumTextureResources';

describe('frustum texture resources', () => {
  it('derives stable cache keys for low-res and selected-image textures', () => {
    const file = createFile();

    expect(getFrustumTextureCacheKey('blob:image', 'image.jpg', true)).toBe('image.jpg\nblob:image');
    expect(getFrustumTextureCacheKey('blob:image', 'image.jpg', false)).toBe('');
    expect(getFrustumTextureCacheKey(null, 'image.jpg', true)).toBe('');
    expect(getSelectedImageTextureCacheKey(file, 'image.jpg', true)).toBe('selected\nimage.jpg');
    expect(getSelectedImageTextureCacheKey(file, 'image.jpg', false)).toBe('');
    expect(getSelectedImageTextureCacheKey(undefined, 'image.jpg', true)).toBe('');
  });

  it('publishes cached frustum textures without starting a bitmap load', () => {
    const texture = new THREE.Texture();
    const getOrLoadBitmap = vi.fn<() => Promise<ImageBitmap | null>>();
    const resource = createFrustumTextureResource({
      getCachedTexture: () => texture,
      getOrLoadBitmap,
      createTextureFromBitmap: vi.fn(),
    });
    const snapshots = recordFrustumSnapshots(resource);

    resource.sync({ cachedUrl: 'blob:image', enabled: true, imageName: 'image.jpg' });

    expect(snapshots).toEqual([{ cacheKey: 'image.jpg\nblob:image', texture }]);
    expect(getOrLoadBitmap).not.toHaveBeenCalled();
  });

  it('invalidates stale frustum bitmap loads when the source becomes disabled', async () => {
    const bitmapDeferred = createDeferred<ImageBitmap | null>();
    const texture = new THREE.Texture();
    const createTextureFromBitmap = vi.fn(() => texture);
    const resource = createFrustumTextureResource({
      getCachedTexture: () => null,
      getOrLoadBitmap: vi.fn(() => bitmapDeferred.promise),
      createTextureFromBitmap,
    });
    const snapshots = recordFrustumSnapshots(resource);

    resource.sync({ cachedUrl: 'blob:image', enabled: true, imageName: 'image.jpg' });
    resource.sync({ cachedUrl: 'blob:image', enabled: false, imageName: 'image.jpg' });

    bitmapDeferred.resolve(createBitmapStub());
    await bitmapDeferred.promise;
    await Promise.resolve();

    expect(createTextureFromBitmap).not.toHaveBeenCalled();
    expect(snapshots).toEqual([
      { cacheKey: 'image.jpg\nblob:image', texture: null },
      { cacheKey: '', texture: null },
    ]);
  });

  it('publishes selected-image textures after bitmap creation', async () => {
    const bitmap = createBitmapStub();
    const texture = new THREE.Texture(bitmap);
    const resource = createSelectedImageTextureResource({
      getCachedTexture: () => null,
      clearTextureCache: vi.fn(),
      createBitmap: vi.fn(async () => bitmap),
      createTextureFromBitmap: vi.fn(() => texture),
      replaceTexture: vi.fn((_imageName, nextTexture) => nextTexture),
    });
    const snapshots = recordSelectedSnapshots(resource);

    resource.sync({ imageFile: createFile(), imageName: 'selected.jpg', isSelected: true });
    await Promise.resolve();

    expect(snapshots).toEqual([
      { cacheKey: 'selected\nselected.jpg', texture: null },
      { cacheKey: 'selected\nselected.jpg', texture },
    ]);
  });

  it('closes stale selected-image bitmaps after deselection', async () => {
    const bitmapDeferred = createDeferred<ImageBitmap>();
    const bitmap = createBitmapStub();
    const replaceTexture = vi.fn((_imageName: string, texture: THREE.Texture) => texture);
    const resource = createSelectedImageTextureResource({
      getCachedTexture: () => null,
      clearTextureCache: vi.fn(),
      createBitmap: vi.fn(() => bitmapDeferred.promise),
      createTextureFromBitmap: vi.fn(() => new THREE.Texture(bitmap)),
      replaceTexture,
    });
    const snapshots = recordSelectedSnapshots(resource);

    resource.sync({ imageFile: createFile(), imageName: 'selected.jpg', isSelected: true });
    resource.sync({ imageFile: createFile(), imageName: 'selected.jpg', isSelected: false });

    bitmapDeferred.resolve(bitmap);
    await bitmapDeferred.promise;
    await Promise.resolve();

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(replaceTexture).not.toHaveBeenCalled();
    expect(snapshots).toEqual([
      { cacheKey: 'selected\nselected.jpg', texture: null },
      { cacheKey: '', texture: null },
    ]);
  });
});

function recordFrustumSnapshots(resource: FrustumTextureResource): TextureSnapshot[] {
  return recordSnapshots(resource.subscribe, resource.getSnapshot);
}

function recordSelectedSnapshots(resource: SelectedImageTextureResource): TextureSnapshot[] {
  return recordSnapshots(resource.subscribe, resource.getSnapshot);
}

function recordSnapshots(
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => TextureSnapshot
): TextureSnapshot[] {
  const snapshots: TextureSnapshot[] = [];
  subscribe(() => {
    snapshots.push(getSnapshot());
  });
  return snapshots;
}

function createFile(): File {
  return new File(['image'], 'image.jpg', { type: 'image/jpeg', lastModified: 1 });
}

function createBitmapStub(): ImageBitmap {
  return buildImageBitmap({
    width: 64,
    height: 32,
    close: vi.fn(),
  });
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolveValue: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve;
  });

  return {
    promise,
    resolve: (value) => {
      resolveValue?.(value);
    },
  };
}
