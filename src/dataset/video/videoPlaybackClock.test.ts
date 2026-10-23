import { expect, it } from 'vitest';
import { createVideoPlaybackClock } from './videoPlaybackClock';

it('retains a fractional seek and waits only until the next presentation timestamp', () => {
  let time = 0;
  const clock = createVideoPlaybackClock(0.8, 2, () => time);
  clock.start(0, 1, true);
  expect(clock.position()).toBe(0.8);
  expect(clock.delayUntil(1)).toBeCloseTo(200);
  time = 150; expect(clock.position()).toBeCloseTo(0.95);
  clock.stop(); time = 5000; expect(clock.position()).toBeCloseTo(0.95);
});

it('bounds advancement to available media and rebases after a slow decode', () => {
  let time = 0;
  const clock = createVideoPlaybackClock(0, 3, () => time);
  clock.start(0, 1, true);
  time = 2000; expect(clock.position()).toBe(1);
  expect(clock.delayUntil(1)).toBe(0);
  clock.allowUntil(2); time += 250;
  expect(clock.position()).toBeCloseTo(1.25);
});

it('keeps a paused preview fixed even after time passes', () => {
  let time = 0;
  const clock = createVideoPlaybackClock(0.8, 2, () => time);
  clock.start(0, 1, false);
  time = 5000; expect(clock.position()).toBe(0.8);
});
