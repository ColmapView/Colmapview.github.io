import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatasetManager } from '../../dataset';
import { buildFile, buildImage, buildReconstruction } from '../../test/builders';
import { useImageDetailFiles } from './useImageDetailFiles';

vi.mock('../../hooks/useFileUrl', () => ({ useFileUrl: (file: File | null) => file ? `blob:${file.name}` : null }));
afterEach(() => vi.clearAllMocks());

describe('image detail File ownership', () => {
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
