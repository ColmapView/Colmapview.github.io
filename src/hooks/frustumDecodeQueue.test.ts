import { describe, expect, it, vi } from 'vitest';
import { createFrustumDecodeQueue } from './frustumDecodeQueue';

describe('frustum decode scheduling', () => {
  it('bounds active work and dispatches selection before speculative work', async () => {
    const queue = createFrustumDecodeQueue(1);
    let finish!: (value: ImageBitmap | null) => void;
    const first = queue.run('first', 'visible', () => new Promise(resolve => { finish = resolve; }));
    const order: string[] = [];
    const background = queue.run('background', 'prefetch', async () => { order.push('background'); return null; });
    const selection = queue.run('selection', 'selected', async () => { order.push('selection'); return null; });
    await Promise.resolve();
    expect(queue.getStats()).toMatchObject({ active: 1, queued: 2 });
    finish(null);
    await Promise.all([first, background, selection]);
    expect(order).toEqual(['selection', 'background']);
  });

  it('pauses only speculation, and lets selected demand promote a queued decode', async () => {
    const queue = createFrustumDecodeQueue(1);
    queue.pause();
    const start = vi.fn(async () => null);
    const selected = queue.run('same', 'prefetch', start);
    const background = queue.run('other', 'prefetch', async () => null);
    await Promise.resolve();
    expect(start).not.toHaveBeenCalled();
    queue.promote('same', 'selected');
    await selected;
    expect(start).toHaveBeenCalledOnce();
    expect(queue.getStats().queued).toBe(1);
    queue.resume();
    await background;
  });

  it('settles queued work on clear and releases a slot after decode failure', async () => {
    const queue = createFrustumDecodeQueue(1);
    queue.pause();
    const oldStart = vi.fn(async () => null);
    const stale = queue.run('old', 'prefetch', oldStart);
    queue.clear();
    await expect(stale).resolves.toBeNull();
    expect(oldStart).not.toHaveBeenCalled();
    await expect(queue.run('bad', 'visible', () => { throw new Error('decode'); })).resolves.toBeNull();
    await expect(queue.run('new', 'visible', async () => null)).resolves.toBeNull();
  });
});
