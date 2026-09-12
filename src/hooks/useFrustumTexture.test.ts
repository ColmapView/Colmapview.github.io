import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildImageBitmap } from '../test/builders';
import {
  clearFrustumTextureCache,
  clearSelectedImageTexture,
  prefetchFrustumTexturesInBackground,
  useFrustumTexture,
  useSelectedImageTexture,
  getFrustumTextureCacheStats,
} from './useFrustumTexture';

let restoreCanvasToBlob: (() => void) | null = null;
let restoreObjectUrls: (() => void) | null = null;
let restoreCanvasContext: (() => void) | null = null;

beforeEach(() => {
  restoreCanvasContext = installCanvasContext();
  restoreCanvasToBlob = installCanvasToBlob();
  restoreObjectUrls = installObjectUrls();
  vi.stubGlobal('fetch', vi.fn(async () => ({
    blob: async () => new Blob(['decoded'], { type: 'image/jpeg' }),
  })));
});

afterEach(() => {
  cleanup();
  clearFrustumTextureCache();
  clearSelectedImageTexture();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreCanvasContext?.();
  restoreCanvasToBlob?.();
  restoreObjectUrls?.();
  restoreCanvasContext = null;
  restoreCanvasToBlob = null;
  restoreObjectUrls = null;
});

describe('useFrustumTexture', () => {
  it('does not reuse a same-name file from the previous dataset after clear', async () => {
    const a = new File(['a'], 'same.jpg');
    const b = new File(['b'], 'same.jpg');
    const bitmapA = createBitmapStub();
    const reloadedA = createBitmapStub();
    const bitmapB = createBitmapStub();
    const decode = vi.fn().mockResolvedValueOnce(bitmapA).mockResolvedValueOnce(reloadedA).mockResolvedValueOnce(bitmapB);
    vi.stubGlobal('createImageBitmap', decode);
    const { result, rerender } = renderHook(({ file }) => useFrustumTexture(file, 'same.jpg', true), { initialProps: { file: a } });
    await waitFor(() => expect(result.current?.image).toBe(bitmapA));
    await act(async () => { clearFrustumTextureCache(); });
    // Leave A mounted across the clear, as the dataset loading workflow does.
    await waitFor(() => expect(result.current?.image).toBe(reloadedA));
    rerender({ file: b });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.image).toBe(bitmapB));
    expect(decode).toHaveBeenCalledTimes(3);
  });
  it('keeps replacement decode tracking when an old same-name decode finishes after clear', async () => {
    const oldDecode = createBitmapDeferred();
    const newDecode = createBitmapDeferred();
    const createBitmap = vi.fn().mockReturnValueOnce(oldDecode.promise).mockReturnValueOnce(newDecode.promise);
    vi.stubGlobal('createImageBitmap', createBitmap);
    const first = prefetchFrustumTexturesInBackground([{ file: createFile(), name: 'same.jpg' }]);
    await waitFor(() => expect(createBitmap).toHaveBeenCalledTimes(1));
    clearFrustumTextureCache();
    const replacementFile = createFile();
    const second = prefetchFrustumTexturesInBackground([{ file: replacementFile, name: 'same.jpg' }]);
    await waitFor(() => expect(createBitmap).toHaveBeenCalledTimes(2));
    const oldBitmap = createBitmapStub();
    oldDecode.resolve(oldBitmap);
    await first;
    expect(oldBitmap.close).toHaveBeenCalledOnce();
    const third = prefetchFrustumTexturesInBackground([{ file: replacementFile, name: 'same.jpg' }]);
    newDecode.resolve(createBitmapStub());
    await Promise.all([second, third]);
    expect(createBitmap).toHaveBeenCalledTimes(2);
  });

  it('returns null without decoding when disabled', () => {
    const createBitmap = vi.fn(async () => createBitmapStub());
    vi.stubGlobal('createImageBitmap', createBitmap);

    const { result } = renderHook(() => useFrustumTexture(createFile(), 'image.jpg', false));

    expect(result.current).toBeNull();
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it('publishes a low-resolution texture after bitmap cache resize resolves', async () => {
    const decodedBitmap = createBitmapStub({ width: 256, height: 128 });
    const textureBitmap = createBitmapStub({ width: 96, height: 48 });
    const createBitmap = vi.fn()
      .mockResolvedValueOnce(decodedBitmap)
      .mockResolvedValueOnce(textureBitmap);
    vi.stubGlobal('createImageBitmap', createBitmap);

    const file = createFile();
    const { result } = renderHook(() => useFrustumTexture(file, 'image.jpg', true));

    await waitFor(() => {
      expect(result.current).toBeInstanceOf(THREE.Texture);
    });

    expect(result.current?.image).toBe(textureBitmap);
    expect(decodedBitmap.close).toHaveBeenCalledOnce();
    expect(createBitmap).toHaveBeenCalledTimes(2);
  });

  it('uses a prefetched image-plane bitmap even when the frustum has no file attached yet', async () => {
    const prefetchedBitmap = createBitmapStub({ width: 256, height: 128 });
    const textureBitmap = createBitmapStub({ width: 96, height: 48 });
    const createBitmap = vi.fn()
      .mockResolvedValueOnce(prefetchedBitmap)
      .mockResolvedValueOnce(textureBitmap);
    vi.stubGlobal('createImageBitmap', createBitmap);

    await prefetchFrustumTexturesInBackground([{ file: createFile(), name: 'image.jpg' }]);

    const { result } = renderHook(() => useFrustumTexture(undefined, 'image.jpg', true));

    await waitFor(() => {
      expect(result.current).toBeInstanceOf(THREE.Texture);
    });

    expect(result.current?.image).toBe(textureBitmap);
    expect(prefetchedBitmap.close).toHaveBeenCalledOnce();
    expect(createBitmap).toHaveBeenCalledTimes(2);
  });

  it('updates a mounted image-plane texture when background prefetch fills the bitmap cache', async () => {
    const prefetchedBitmap = createBitmapStub({ width: 256, height: 128 });
    const textureBitmap = createBitmapStub({ width: 96, height: 48 });
    const createBitmap = vi.fn()
      .mockResolvedValueOnce(prefetchedBitmap)
      .mockResolvedValueOnce(textureBitmap);
    vi.stubGlobal('createImageBitmap', createBitmap);

    const { result } = renderHook(() => useFrustumTexture(undefined, 'image.jpg', true));
    expect(result.current).toBeNull();

    await act(async () => {
      await prefetchFrustumTexturesInBackground([{ file: createFile(), name: 'image.jpg' }]);
    });

    await waitFor(() => {
      expect(result.current).toBeInstanceOf(THREE.Texture);
    });

    expect(result.current?.image).toBe(textureBitmap);
    expect(prefetchedBitmap.close).toHaveBeenCalledOnce();
    expect(createBitmap).toHaveBeenCalledTimes(2);
  });
});

describe('useSelectedImageTexture', () => {
  it('bounds rapid selected-image decoding and skips obsolete queued selections', async () => {
    const pending: Array<{ file: File; resolve: (bitmap: ImageBitmap) => void }> = [];
    vi.stubGlobal('createImageBitmap', vi.fn((file: File) => new Promise<ImageBitmap>(resolve => pending.push({ file, resolve }))));
    const files = Array.from({ length: 12 }, (_, index) => new File([String(index)], `${index}.jpg`));
    const { result, rerender } = renderHook(({ file }) => useSelectedImageTexture(file, file.name, true), { initialProps: { file: files[0] } });
    await waitFor(() => expect(pending).toHaveLength(1));
    for (const file of files.slice(1)) await act(async () => { rerender({ file }); });
    expect(pending).toHaveLength(4);
    expect(getFrustumTextureCacheStats().decodeQueue.active).toBe(4);
    const stale = pending.map(() => createBitmapStub());
    await act(async () => { pending.slice(0, 4).forEach((job, index) => job.resolve(stale[index])); });
    await waitFor(() => expect(pending).toHaveLength(5));
    expect(pending[4].file).toBe(files[11]);
    const current = createBitmapStub();
    await act(async () => { pending[4].resolve(current); });
    await waitFor(() => expect(result.current?.image).toBe(current));
    stale.forEach(bitmap => expect(bitmap.close).toHaveBeenCalledOnce());
  });
  it('replaces a selected same-name texture when its File changes', async () => {
    const a = new File(['a'], 'same.jpg');
    const b = new File(['b'], 'same.jpg');
    const bitmapA = createBitmapStub();
    const bitmapB = createBitmapStub();
    vi.stubGlobal('createImageBitmap', vi.fn(async (file: File) => file === a ? bitmapA : bitmapB));
    const { result, rerender } = renderHook(({ file }) => useSelectedImageTexture(file, 'same.jpg', true), { initialProps: { file: a } });
    await waitFor(() => expect(result.current?.image).toBe(bitmapA));
    rerender({ file: b });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.image).toBe(bitmapB));
  });
  it('publishes the selected high-resolution texture after bitmap load', async () => {
    const bitmap = createBitmapStub();
    const createBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal('createImageBitmap', createBitmap);
    const file = createFile();

    const { result } = renderHook(() => useSelectedImageTexture(file, 'selected.jpg', true));

    await waitFor(() => {
      expect(result.current).toBeInstanceOf(THREE.Texture);
    });

    expect(result.current?.image).toBe(bitmap);
    expect(createBitmap).toHaveBeenCalledWith(file);
  });

  it('reuses the cached selected texture when reselected', async () => {
    const bitmap = createBitmapStub();
    const createBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal('createImageBitmap', createBitmap);
    const file = createFile();

    const { result, rerender } = renderHook(
      ({ isSelected }: { isSelected: boolean }) => useSelectedImageTexture(file, 'selected.jpg', isSelected),
      { initialProps: { isSelected: true } }
    );

    await waitFor(() => {
      expect(result.current).toBeInstanceOf(THREE.Texture);
    });
    const firstTexture = result.current;

    rerender({ isSelected: false });
    expect(result.current).toBeNull();

    rerender({ isSelected: true });
    await waitFor(() => {
      expect(result.current).toBe(firstTexture);
    });
    expect(createBitmap).toHaveBeenCalledOnce();
  });

  it('delays selected high-resolution texture loading until fly-to can settle', async () => {
    vi.useFakeTimers();
    const bitmap = createBitmapStub();
    const createBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal('createImageBitmap', createBitmap);
    const file = createFile();

    const { result } = renderHook(() => useSelectedImageTexture(file, 'selected.jpg', true, 600));

    expect(result.current).toBeNull();
    expect(createBitmap).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(599);
      await Promise.resolve();
    });
    expect(createBitmap).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current).toBeInstanceOf(THREE.Texture);
    expect(result.current?.image).toBe(bitmap);
    expect(createBitmap).toHaveBeenCalledWith(file);
  });

  it('closes stale selected-image bitmaps after deselection', async () => {
    const deferred = createBitmapDeferred();
    const createBitmap = vi.fn(() => deferred.promise);
    vi.stubGlobal('createImageBitmap', createBitmap);
    const file = createFile();

    const { result, rerender } = renderHook(
      ({ isSelected }: { isSelected: boolean }) => useSelectedImageTexture(file, 'selected.jpg', isSelected),
      { initialProps: { isSelected: true } }
    );
    await waitFor(() => expect(createBitmap).toHaveBeenCalledOnce());
    rerender({ isSelected: false });

    const bitmap = createBitmapStub();
    await act(async () => {
      deferred.resolve(bitmap);
      await deferred.promise;
    });

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(result.current).toBeNull();
  });
});

function createFile(): File {
  return new File(['image'], 'image.jpg', { type: 'image/jpeg', lastModified: 1 });
}

function createBitmapStub(overrides: Partial<ImageBitmap> = {}): ImageBitmap {
  return buildImageBitmap({
    width: 64,
    height: 32,
    close: vi.fn(),
    ...overrides,
  });
}

function createBitmapDeferred(): {
  promise: Promise<ImageBitmap>;
  resolve: (bitmap: ImageBitmap) => void;
} {
  let resolveBitmap: ((bitmap: ImageBitmap) => void) | null = null;
  const promise = new Promise<ImageBitmap>((resolve) => {
    resolveBitmap = resolve;
  });

  return {
    promise,
    resolve: (bitmap) => {
      resolveBitmap?.(bitmap);
    },
  };
}

function installCanvasToBlob(): () => void {
  const originalToBlob = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    value: (callback: BlobCallback) => {
      callback(new Blob(['png'], { type: 'image/png' }));
    },
  });

  return () => {
    restoreProperty(HTMLCanvasElement.prototype, 'toBlob', originalToBlob);
  };
}

function installCanvasContext(): () => void {
  const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({
      drawImage: vi.fn(),
    })),
  });

  return () => {
    restoreProperty(HTMLCanvasElement.prototype, 'getContext', originalGetContext);
  };
}

function installObjectUrls(): () => void {
  const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  let nextId = 0;

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => `blob:frustum-${nextId++}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });

  return () => {
    restoreProperty(URL, 'createObjectURL', originalCreateObjectUrl);
    restoreProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
  };
}

function restoreProperty(
  target: object,
  propertyName: string,
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(target, propertyName, descriptor);
    return;
  }

  Reflect.deleteProperty(target, propertyName);
}
