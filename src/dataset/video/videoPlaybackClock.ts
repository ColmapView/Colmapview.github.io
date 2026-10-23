/** Presentation time is independent of the start timestamp of the displayed frame. */
export function createVideoPlaybackClock(timestamp: number, duration: number, now = () => performance.now()) {
  let base = timestamp, wall = now(), availableUntil = timestamp, running = false;
  const position = () => Math.min(duration, availableUntil, base + (running ? (now() - wall) / 1000 : 0));
  return {
    position,
    start(firstTimestamp: number, endTimestamp: number, advancing: boolean) {
      base = Math.max(timestamp, firstTimestamp); wall = now();
      availableUntil = Math.max(base, endTimestamp); running = advancing;
    },
    allowUntil(timestamp: number) { availableUntil = Math.max(availableUntil, timestamp); },
    delayUntil(timestamp: number) {
      let delay = (timestamp - base) * 1000 - (now() - wall);
      // Slow decoding freezes at the available frame instead of skipping ahead.
      if (delay < -250) { wall -= delay; delay = 0; }
      return Math.max(0, delay);
    },
    stop() { base = position(); availableUntil = base; running = false; },
  };
}
