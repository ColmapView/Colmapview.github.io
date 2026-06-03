import * as THREE from 'three';

export interface TextureSnapshot {
  cacheKey: string;
  texture: THREE.Texture | null;
}

export interface FrustumTextureResource {
  getSnapshot: () => TextureSnapshot;
  subscribe: (listener: () => void) => () => void;
  sync: (options: {
    cachedUrl: string | null;
    enabled: boolean;
    imageName: string;
  }) => void;
}

export interface SelectedImageTextureResource {
  getSnapshot: () => TextureSnapshot;
  subscribe: (listener: () => void) => () => void;
  sync: (options: {
    imageFile: File | undefined;
    imageName: string;
    isSelected: boolean;
  }) => void;
}

export interface FrustumTextureResourceDeps {
  getCachedTexture: (imageName: string) => THREE.Texture | null;
  getOrLoadBitmap: (url: string, imageName: string) => Promise<ImageBitmap | null>;
  createTextureFromBitmap: (bitmap: ImageBitmap, imageName: string) => THREE.Texture | null;
}

export interface SelectedImageTextureResourceDeps {
  getCachedTexture: (imageName: string) => THREE.Texture | null;
  clearTextureCache: () => void;
  createBitmap: (imageFile: File) => Promise<ImageBitmap>;
  createTextureFromBitmap: (bitmap: ImageBitmap) => THREE.Texture;
  replaceTexture: (imageName: string, texture: THREE.Texture) => THREE.Texture;
}

export const EMPTY_TEXTURE_SNAPSHOT: TextureSnapshot = {
  cacheKey: '',
  texture: null,
};

export function getFrustumTextureCacheKey(
  cachedUrl: string | null,
  imageName: string,
  enabled: boolean
): string {
  return enabled && cachedUrl ? `${imageName}\n${cachedUrl}` : '';
}

export function getSelectedImageTextureCacheKey(
  imageFile: File | undefined,
  imageName: string,
  isSelected: boolean
): string {
  return isSelected && imageFile ? `selected\n${imageName}` : '';
}

export function createFrustumTextureResource({
  getCachedTexture,
  getOrLoadBitmap,
  createTextureFromBitmap,
}: FrustumTextureResourceDeps): FrustumTextureResource {
  const store = createTextureStore();
  let requestId = 0;
  let pendingCacheKey = '';

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    sync: ({ cachedUrl, enabled, imageName }) => {
      const cacheKey = getFrustumTextureCacheKey(cachedUrl, imageName, enabled);
      if (!cacheKey || !cachedUrl) {
        requestId++;
        pendingCacheKey = '';
        store.publish(EMPTY_TEXTURE_SNAPSHOT);
        return;
      }

      const cachedTexture = getCachedTexture(imageName);
      if (cachedTexture) {
        requestId++;
        pendingCacheKey = '';
        store.publish({ cacheKey, texture: cachedTexture });
        return;
      }

      store.publish({ cacheKey, texture: null });
      if (pendingCacheKey === cacheKey) return;

      pendingCacheKey = cacheKey;
      const currentRequestId = ++requestId;
      getOrLoadBitmap(cachedUrl, imageName).then((bitmap) => {
        if (requestId !== currentRequestId) return;

        pendingCacheKey = '';
        if (!bitmap) return;

        const texture = createTextureFromBitmap(bitmap, imageName);
        if (!texture) return;

        store.publish({ cacheKey, texture });
      });
    },
  };
}

export function createSelectedImageTextureResource({
  getCachedTexture,
  clearTextureCache,
  createBitmap,
  createTextureFromBitmap,
  replaceTexture,
}: SelectedImageTextureResourceDeps): SelectedImageTextureResource {
  const store = createTextureStore();
  let requestId = 0;
  let pendingCacheKey = '';

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    sync: ({ imageFile, imageName, isSelected }) => {
      const cacheKey = getSelectedImageTextureCacheKey(imageFile, imageName, isSelected);
      if (!cacheKey || !imageFile) {
        requestId++;
        pendingCacheKey = '';
        store.publish(EMPTY_TEXTURE_SNAPSHOT);
        return;
      }

      const cachedTexture = getCachedTexture(imageName);
      if (cachedTexture) {
        requestId++;
        pendingCacheKey = '';
        store.publish({ cacheKey, texture: cachedTexture });
        return;
      }

      clearTextureCache();
      store.publish({ cacheKey, texture: null });
      if (pendingCacheKey === cacheKey) return;

      pendingCacheKey = cacheKey;
      const currentRequestId = ++requestId;
      createBitmap(imageFile).then((bitmap) => {
        if (requestId !== currentRequestId) {
          bitmap.close();
          return;
        }

        pendingCacheKey = '';
        const texture = replaceTexture(imageName, createTextureFromBitmap(bitmap));

        store.publish({ cacheKey, texture });
      }).catch(() => {
        if (requestId !== currentRequestId) return;

        pendingCacheKey = '';
        store.publish({ cacheKey, texture: null });
      });
    },
  };
}

function createTextureStore() {
  let snapshot = EMPTY_TEXTURE_SNAPSHOT;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const publish = (nextSnapshot: TextureSnapshot) => {
    if (
      snapshot.cacheKey === nextSnapshot.cacheKey &&
      Object.is(snapshot.texture, nextSnapshot.texture)
    ) {
      return;
    }

    snapshot = nextSnapshot;
    emit();
  };

  return {
    getSnapshot: () => snapshot,
    publish,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
