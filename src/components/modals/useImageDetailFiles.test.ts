import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatasetManager } from '../../dataset';
import type { DatasetAccessOptions } from '../../dataset/types';
import { buildFile, buildImage, buildReconstruction } from '../../test/builders';
import { useImageDetailFiles } from './useImageDetailFiles';

vi.mock('../../hooks/useFileUrl', () => ({ useFileUrl: (file: File | null) => file ? `blob:${file.name}` : null }));
afterEach(() => vi.clearAllMocks());

describe('image detail File ownership', () => {
  it('retries failed panes independently without treating an absent mask as an error', async () => {
    const image = buildImage({ imageId: 1, name: 'a.jpg' });
    const matchedImage = buildImage({ imageId: 2, name: 'b.jpg' });
    let failImage = true;
    const getImage = vi.fn(async (name: string, options?: DatasetAccessOptions) => {
      if (name === 'a.jpg' && failImage) {
        options?.onError?.({ kind: 'http', status: 503, message: 'Unavailable' });
        return null;
      }
      return buildFile(name);
    });
    const getMask = vi.fn(async () => null);
    const dataset = { hasImages: () => true, hasMasks: () => true, getImageSync: () => undefined, getMaskSync: () => undefined, getImage, getMask } as unknown as DatasetManager;
    const props = { dataset, reconstruction: buildReconstruction(), imageDetailId: 1, matchedImageId: 2, image, matchedImage };
    const { result } = renderHook(useImageDetailFiles, { initialProps: props });
    await waitFor(() => expect(result.current.imageFailed).toBe(true));
    expect(result.current.maskFailed).toBe(false);
    expect(result.current.matchedImageSrc).toBe('blob:b.jpg');
    expect(getImage).toHaveBeenCalledTimes(2);
    failImage = false;
    await act(async () => result.current.retryImage());
    await waitFor(() => expect(result.current.imageSrc).toBe('blob:a.jpg'));
    expect(result.current.imageFailed).toBe(false);
    expect(getImage.mock.calls.map(([name]) => name)).toEqual(['a.jpg', 'b.jpg', 'a.jpg']);
    expect(getMask).toHaveBeenCalledOnce();
  });

  it('does not carry a failed request into a different image', async () => {
    const first = buildImage({ imageId: 1, name: 'a.jpg' });
    const second = buildImage({ imageId: 2, name: 'b.jpg' });
    let oldAccess: DatasetAccessOptions | undefined;
    const getImage = vi.fn(async (name: string, options?: DatasetAccessOptions) => {
      if (name === 'a.jpg') { oldAccess = options; options?.onError?.({ kind: 'network', message: 'Offline' }); return null; }
      return buildFile(name);
    });
    const dataset = { hasImages: () => true, hasMasks: () => false, getImageSync: () => undefined, getMaskSync: () => undefined, getImage, getMask: async () => null } as unknown as DatasetManager;
    const props = { dataset, reconstruction: buildReconstruction(), imageDetailId: 1, matchedImageId: null, image: first, matchedImage: null };
    const { result, rerender } = renderHook(useImageDetailFiles, { initialProps: props });
    await waitFor(() => expect(result.current.imageFailed).toBe(true));
    rerender({ ...props, imageDetailId: 2, image: second });
    expect(result.current.imageFailed).toBe(false);
    oldAccess?.onError?.({ kind: 'network', message: 'Late error' });
    await waitFor(() => expect(result.current.imageSrc).toBe('blob:b.jpg'));
    expect(result.current.imageFailed).toBe(false);
    expect(oldAccess?.signal?.aborted).toBe(true);
  });

  it('retains cached primary A while matched B evicts it, then releases only the changed pane', async () => {
    const a = buildImage({ imageId: 1, name: 'a.jpg' });
    const b = buildImage({ imageId: 2, name: 'b.jpg' });
    const c = buildImage({ imageId: 3, name: 'c.jpg' });
    const fileA = buildFile('a.jpg');
    const fileB = buildFile('b.jpg');
    const fileC = buildFile('c.jpg');
    const cache = new Map([['a.jpg', fileA]]);
    const getImage = vi.fn(async (name: string) => {
      cache.clear();
      const file = name === 'b.jpg' ? fileB : fileC;
      cache.set(name, file);
      return file;
    });
    const dataset = { hasImages: () => true, hasMasks: () => false, getImageSync: (name: string) => cache.get(name), getMaskSync: () => undefined, getImage, getMask: async () => null } as unknown as DatasetManager;
    const reconstruction = buildReconstruction({ images: [a, b, c] });
    const props: Parameters<typeof useImageDetailFiles>[0] = { dataset, reconstruction, imageDetailId: 1, matchedImageId: 2, image: a, matchedImage: b };
    const { result, rerender } = renderHook(useImageDetailFiles, { initialProps: props });
    await waitFor(() => expect(result.current.matchedImageFile).toBe(fileB));
    expect(cache.has('a.jpg')).toBe(false);
    expect(result.current.imageFile).toBe(fileA);
    rerender({ ...props, matchedImageId: 3, matchedImage: c });
    await waitFor(() => expect(result.current.matchedImageFile).toBe(fileC));
    expect(result.current.imageFile).toBe(fileA);
    expect(getImage.mock.calls.map(([name]) => name)).toEqual(['b.jpg', 'c.jpg']);
    cache.clear();
    rerender({ ...props, reconstruction: buildReconstruction(), image: null, matchedImage: null });
    expect(result.current.imageFile).toBeNull();
    expect(result.current.matchedImageFile).toBeNull();
  });

  it('does not reuse a previous reconstruction File or publish its late result under the same name', async () => {
    const image = buildImage({ imageId: 1, name: 'same.jpg' });
    let resolveOld!: (file: File) => void;
    const fresh = buildFile('fresh.jpg');
    const getImage = vi.fn().mockImplementationOnce(() => new Promise<File>(resolve => { resolveOld = resolve; })).mockResolvedValue(fresh);
    const dataset = { hasImages: () => true, hasMasks: () => false, getImageSync: () => undefined, getMaskSync: () => undefined, getImage, getMask: async () => null } as unknown as DatasetManager;
    const props: Parameters<typeof useImageDetailFiles>[0] = { dataset, reconstruction: buildReconstruction(), imageDetailId: 1, matchedImageId: null, image, matchedImage: null };
    const { result, rerender } = renderHook(useImageDetailFiles, { initialProps: props });
    rerender({ ...props, reconstruction: buildReconstruction() });
    await waitFor(() => expect(result.current.imageFile).toBe(fresh));
    await act(async () => resolveOld(buildFile('obsolete.jpg')));
    expect(result.current.imageFile).toBe(fresh);
    expect(getImage.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
