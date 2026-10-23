import { expect, it, vi } from 'vitest';
import { createVideoFrameQueue } from './videoFrameQueue';
import type { FileRequestContext } from '../../utils/imageFileRequestState';
import type { MediaPriority } from '../types';

const context = (priority: MediaPriority, controller = new AbortController()): FileRequestContext => ({
  token: Symbol(), generation: 0, signal: controller.signal, getPriority: () => priority,
  isCurrent: () => !controller.signal.aborted, reportFailure() {},
});

it('prioritizes selected cameras over queued prefetches and runs one decoder at a time', async () => {
  const queue = createVideoFrameQueue().read, order: string[] = [];
  let finish!: () => void;
  const first = queue(context('visible'), () => new Promise(resolve => { finish = () => resolve(null); }));
  const background = queue(context('prefetch'), async () => { order.push('prefetch'); return null; });
  const selected = queue(context('selected'), async () => { order.push('selected'); return null; });
  expect(order).toEqual([]);
  finish(); await Promise.all([first, background, selected]);
  expect(order).toEqual(['selected', 'prefetch']);
});

it('removes cancelled queued work without starting its decoder', async () => {
  const queue = createVideoFrameQueue().read;
  let finish!: () => void, started = false;
  const first = queue(context('visible'), () => new Promise(resolve => { finish = () => resolve(null); }));
  const controller = new AbortController();
  const cancelled = queue(context('visible', controller), async () => { started = true; return null; });
  controller.abort(); expect(await cancelled).toBeNull();
  finish(); await first;
  expect(started).toBe(false);
});

it('pauses playback for a required read and waits for decoder cleanup before running it', async () => {
  const queue = createVideoFrameQueue(), order: string[] = [];
  let finish!: () => void;
  const playback = queue.playback(context('selected'), async () => {
    await new Promise<void>(resolve => { finish = resolve; });
    order.push('disposed'); return null;
  }, () => { order.push('interrupted'); finish(); });
  const background = queue.read(context('visible'), async () => { order.push('visible'); return null; });
  expect(order).toEqual([]);
  const foreground = queue.read(context('metric'), async () => { order.push('metric'); return null; });
  await Promise.all([playback, background, foreground]);
  expect(order[0]).toBe('interrupted'); expect(order[1]).toBe('disposed');
  expect(order).toContain('metric');
});

it('finishes already queued required reads before starting a long playback session', async () => {
  const queue = createVideoFrameQueue(), order: string[] = [];
  let finish!: () => void;
  const active = queue.read(context('visible'), () => new Promise(resolve => { finish = () => resolve(null); }));
  const playback = queue.playback(context('selected'), async () => { order.push('playback'); return null; }, vi.fn());
  const required = queue.read(context('metric'), async () => { order.push('metric'); return null; });
  finish(); await Promise.all([active, playback, required]);
  expect(order).toEqual(['metric', 'playback']);
});
