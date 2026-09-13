import { describe, expect, it } from 'vitest';
import { createUrlFileCache } from './urlFileCache';
import { createImageFileRequestState } from '../utils/imageFileRequestState';

const file = (bytes: number) => new File([new Uint8Array(bytes)], `${bytes}.jpg`);
describe('combined URL File retention', () => {
  it('accounts exact shared bytes, refreshes reads, and evicts the oldest across representations', () => {
    const cache = createUrlFileCache(10);
    const images = cache.scope('display');
    const masks = cache.scope('mask');
    const visible = file(4);
    images.set('a', visible);
    masks.set('b', file(4));
    expect(images.get('a')).toBe(visible);
    images.set('c', file(4));
    expect(masks.get('b')).toBeUndefined();
    expect(images.getStats()).toEqual({ count: 2, sizeBytes: 8 });
    expect(cache.getStats()).toMatchObject({ retainedBytes: 8, evictions: 1, budgetBytes: 10 });
    // A consumer keeps its File even when the cache lets go of its reference.
    masks.set('large-mask', file(10));
    expect(images.get('a')).toBeUndefined();
    expect(visible.size).toBe(4);
    expect(cache.getStats().retainedBytes).toBe(10);
  });

  it('keeps revisited image/mask pairs through unrelated gallery snapshot enumeration', async () => {
    const cache = createUrlFileCache(12);
    const images = createImageFileRequestState(cache.scope('display'));
    const masks = createImageFileRequestState(cache.scope('mask'));
    for (const name of ['c', 'd', 'e']) {
      await images.request(name, async () => file(2));
      await masks.request(name, async () => file(2));
    }
    const snapshot = () => {
      for (const name of ['a', 'b', 'c', 'd', 'e']) {
        images.peekCached(name);
        masks.peekCached(name);
      }
    };
    const imageA = await images.request('a', async () => file(2));
    snapshot();
    const maskA = await masks.request('a', async () => file(2));
    snapshot();
    await images.request('b', async () => file(2));
    snapshot();
    await masks.request('b', async () => file(2));
    snapshot();
    expect(images.peekCached('a')).toBe(imageA);
    expect(masks.peekCached('a')).toBe(maskA);
    expect(images.peekCached('c')).toBeUndefined();
    expect(masks.peekCached('c')).toBeUndefined();

    // A real consumer cache hit still refreshes recency across representations.
    await images.request('e', async () => { throw new Error('must use retained File'); });
    await masks.request('f', async () => file(2));
    expect(images.peekCached('e')).toBeDefined();
    expect(masks.peekCached('e')).toBeUndefined();
    expect(cache.getStats().retainedBytes).toBe(12);
  });

  it('replacement, deletion and namespace clear adjust totals without double-counting', () => {
    const cache = createUrlFileCache(20);
    const images = cache.scope('display');
    const masks = cache.scope('mask');
    images.set('a', file(8));
    images.set('a', file(3));
    masks.set('a', file(4));
    expect(cache.getStats().retainedBytes).toBe(7);
    images.delete('a');
    images.delete('a');
    expect(cache.getStats().retainedBytes).toBe(4);
    masks.clear();
    expect(cache.getStats()).toMatchObject({ count: 0, retainedBytes: 0 });
    expect(masks.getStats()).toEqual({ count: 0, sizeBytes: 0 });
  });

  it('delivers oversized entries without retention and keeps lifecycle clears effective', async () => {
    const cache = createUrlFileCache(5);
    const state = createImageFileRequestState(cache.scope('display'));
    const oversized = file(6);
    await expect(state.request('oversized', async () => oversized)).resolves.toBe(oversized);
    expect(state.getCached('oversized')).toBeUndefined();
    expect(cache.getStats()).toMatchObject({ retainedBytes: 0, oversizedBypasses: 1 });
    await state.request('small', async () => file(5));
    state.clear();
    expect(cache.getStats().retainedBytes).toBe(0);
  });
});
