import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageCacheCanvas } from './asyncImageCanvas';

vi.mock('./asyncImageCanvas', () => ({
  createBrowserImageCacheCanvas: () => ({
    getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }), putImageData() {} }),
    toBlob: (callback: BlobCallback) => callback(new Blob(['123456'], { type: 'image/png' })),
  }),
}));
import { clearMaskedThumbnailCache, createMaskedThumbnailCanvas, getMaskedThumbnailCacheStats, loadMaskedThumbnail, useMaskedThumbnail } from './useMaskedThumbnail';

const bitmap = () => ({ width: 1, height: 1, close: vi.fn() }) as unknown as ImageBitmap;
const files = () => [new File(['image'], 'same.png', { lastModified: 1 }), new File(['mask'], 'same-mask.png', { lastModified: 1 })] as const;
let sequence = 0;
const createUrl = vi.fn(() => `blob:masked-${++sequence}`);
const revokeUrl = vi.fn((url: string) => {
  expect(document.querySelector(`img[src="${url}"]`)).toBeNull();
});
beforeEach(() => {
  sequence = 0; createUrl.mockClear(); revokeUrl.mockClear();
  vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap()));
});
afterEach(() => { cleanup(); clearMaskedThumbnailCache(); vi.unstubAllGlobals(); });
function Thumbnail({ input }: { input: readonly [File, File] }) {
  const url = useMaskedThumbnail(input[0], input[1], 'same.png', true);
  return url ? <img src={url} alt="thumbnail" /> : null;
}

describe('masked thumbnail consumer ownership', () => {
  it('keeps two cleared consumers alive and detaches before releasing a same-metadata replacement', async () => {
    const input = files();
    function View({ first, current }: { first: boolean; current: readonly [File, File] }) {
      return <>{first && <Thumbnail input={input} />}<Thumbnail input={current} /></>;
    }
    const view = render(<View first current={input} />);
    await waitFor(() => expect(view.getAllByAltText('thumbnail')).toHaveLength(2));
    const oldUrl = view.getAllByAltText('thumbnail')[0].getAttribute('src');
    expect(createImageBitmap).toHaveBeenCalledTimes(2);
    expect(createUrl).toHaveBeenCalledOnce();
    clearMaskedThumbnailCache();
    expect(getMaskedThumbnailCacheStats()).toMatchObject({ retiredBytes: 6 });
    view.rerender(<View first={false} current={input} />);
    expect(revokeUrl).not.toHaveBeenCalled();
    const complete: Array<(result: ImageBitmap) => void> = [];
    vi.mocked(createImageBitmap).mockImplementation(() => new Promise(resolve => complete.push(resolve)));
    view.rerender(<View first={false} current={files()} />);
    expect(view.queryByAltText('thumbnail')).toBeNull();
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith(oldUrl);
    await waitFor(() => expect(complete).toHaveLength(2));
    await act(async () => { complete.forEach(resolve => resolve(bitmap())); });
    await waitFor(() => expect(view.getByAltText('thumbnail')).toBeVisible());
    expect(view.getByAltText('thumbnail').getAttribute('src')).not.toBe(oldUrl);
    view.unmount();
    clearMaskedThumbnailCache();
    expect(revokeUrl).toHaveBeenCalledTimes(2);
  });

  it('ignores a cleared pending decode when a replacement finishes later', async () => {
    const complete: Array<(result: ImageBitmap) => void> = [];
    vi.mocked(createImageBitmap).mockImplementation(() => new Promise(resolve => complete.push(resolve)));
    const view = render(<Thumbnail input={files()} />);
    await waitFor(() => expect(complete).toHaveLength(2));
    clearMaskedThumbnailCache();
    view.rerender(<Thumbnail input={files()} />);
    await waitFor(() => expect(complete).toHaveLength(4));
    await act(async () => { complete.slice(0, 2).forEach(resolve => resolve(bitmap())); });
    expect(createUrl).not.toHaveBeenCalled();
    expect(view.queryByAltText('thumbnail')).toBeNull();
    await act(async () => { complete.slice(2).forEach(resolve => resolve(bitmap())); });
    await waitFor(() => expect(view.getByAltText('thumbnail')).toBeVisible());
    expect(createUrl).toHaveBeenCalledOnce();
  });

  it('closes the fulfilled bitmap if its paired decode fails', async () => {
    const decoded = bitmap();
    vi.mocked(createImageBitmap).mockResolvedValueOnce(decoded).mockRejectedValueOnce(new Error('invalid mask'));
    const input = files();
    await expect(loadMaskedThumbnail(input[0], input[1], false)).resolves.toBeNull();
    expect(decoded.close).toHaveBeenCalledOnce();
  });

  it.each(['canvas creation', 'context lookup'])('closes both bitmaps when %s throws', failure => {
    const image = bitmap(); const mask = bitmap();
    const createCanvas = () => {
      if (failure === 'canvas creation') throw new Error('allocation failed');
      return { getContext: () => { throw new Error('context failed'); } } as unknown as ImageCacheCanvas;
    };
    expect(createMaskedThumbnailCanvas(image, mask, false, 256, createCanvas)).toBeNull();
    expect(image.close).toHaveBeenCalledOnce();
    expect(mask.close).toHaveBeenCalledOnce();
  });
});
