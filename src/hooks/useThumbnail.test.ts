import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildIdleDeadline, buildImageBitmap } from '../test/builders';
import { clearThumbnailCache, prefetchThumbnails, useThumbnail } from './useThumbnail';

vi.mock('./asyncImageCanvas', () => ({
  drawImageBitmapToCacheCanvas: (bitmap: ImageBitmap) => {
    bitmap.close();
    return { toBlob: (callback: BlobCallback) => callback(new Blob(['jpeg'], { type: 'image/jpeg' })) };
  },
}));
let sequence = 0;
const createUrl = vi.fn(() => `blob:matching-frame-${++sequence}`);
const revokeUrl = vi.fn();
beforeEach(() => {
  sequence = 0; createUrl.mockClear(); revokeUrl.mockClear();
  vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
  vi.stubGlobal('OffscreenCanvas', undefined);
  vi.stubGlobal('createImageBitmap', vi.fn(async () => buildImageBitmap({ width: 64, height: 64 })));
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => window.setTimeout(() => callback(buildIdleDeadline({ timeRemaining: () => 50 })), 0));
  vi.stubGlobal('cancelIdleCallback', (id: number) => window.clearTimeout(id));
});
afterEach(() => { cleanup(); clearThumbnailCache(); vi.unstubAllGlobals(); });

it('retains matching-frame thumbnails while loading is paused, without retaining a replaced dataset', async () => {
  const file = new File(['selected video frame'], 'camera.png', { type: 'image/png' });
  await act(async () => { await prefetchThumbnails([{ file, name: 'camera.png' }]); });
  const { result, rerender } = renderHook(({ name, retain }) => useThumbnail(undefined, name, false, { retainCached: retain }),
    { initialProps: { name: 'camera.png', retain: true } });
  expect(result.current).toBe('blob:matching-frame-1');
  rerender({ name: 'camera.png', retain: false });
  expect(result.current).toBeNull();
  rerender({ name: 'unloaded.png', retain: true });
  expect(result.current).toBeNull();
  expect(createImageBitmap).toHaveBeenCalledOnce();
  rerender({ name: 'camera.png', retain: true });
  expect(result.current).toBe('blob:matching-frame-1');
  act(() => clearThumbnailCache());
  rerender({ name: 'camera.png', retain: true });
  expect(result.current).toBeNull();
  expect(revokeUrl).toHaveBeenCalledWith('blob:matching-frame-1');
  await act(async () => { await prefetchThumbnails([{ file: new File(['another frame'], 'camera.png'), name: 'camera.png' }]); });
  rerender({ name: 'camera.png', retain: true });
  expect(result.current).toBe('blob:matching-frame-2');
  expect(createImageBitmap).toHaveBeenCalledTimes(2);
});
