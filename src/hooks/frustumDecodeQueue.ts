export type FrustumDecodePriority = 'selected' | 'visible' | 'prefetch';
const priorityOrder: Record<FrustumDecodePriority, number> = { selected: 0, visible: 1, prefetch: 2 };

/** Limits decoded-image work independently of HTTP transfers and cache retention. */
export function createFrustumDecodeQueue(maxActive = 4) {
  type Job = { key: string; priority: FrustumDecodePriority; start: () => Promise<ImageBitmap | null>; resolve: (bitmap: ImageBitmap | null) => void };
  const queued: Job[] = [];
  let active = 0;
  let paused = false;
  function pump() {
    while (active < maxActive) {
      let next = -1;
      for (let index = 0; index < queued.length; index++) {
        const job = queued[index];
        if (paused && job.priority === 'prefetch') continue;
        if (next < 0 || priorityOrder[job.priority] < priorityOrder[queued[next].priority]) next = index;
      }
      if (next < 0) return;
      const [job] = queued.splice(next, 1);
      active++;
      // Invoke start in a promise to settle and free the slot even on sync throw.
      void Promise.resolve().then(job.start).catch(() => null).then(job.resolve).finally(() => {
        active--;
        pump();
      });
    }
  }
  return {
    run(key: string, priority: FrustumDecodePriority, start: Job['start']): Promise<ImageBitmap | null> {
      return new Promise((resolve) => { queued.push({ key, priority, start, resolve }); pump(); });
    },
    promote(key: string, priority: FrustumDecodePriority) {
      for (const job of queued) {
        if (job.key === key && priorityOrder[priority] < priorityOrder[job.priority]) job.priority = priority;
      }
      pump();
    },
    pause() { paused = true; },
    resume() { paused = false; pump(); },
    clear() {
      for (const job of queued.splice(0)) job.resolve(null);
      paused = false;
      // Active decodes are uncancellable; the owning cache discards stale results.
    },
    getStats: () => ({ active, queued: queued.length, paused, maxActive }),
  };
}
