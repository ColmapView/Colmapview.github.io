import type { MediaPriority } from './types';
import { MEDIA_PRIORITY_ORDER } from '../utils/imageFileRequestState';

export type MediaTransferOutcome =
  | { kind: 'success'; blob: Blob }
  | { kind: 'absent' | 'aborted' }
  | { kind: 'failure'; status?: number };

interface TransferOptions {
  signal: AbortSignal;
  getPriority(): MediaPriority;
}
interface Job {
  url: string;
  origin: string;
  order: number;
  options: TransferOptions;
  attempts: number;
  active: boolean;
  settled: boolean;
  settle(result: MediaTransferOutcome): void;
}
export interface UrlMediaSchedulerPolicy {
  perOrigin: number;
  perPage: number;
  fairnessInterval: number;
  random: () => number;
}
export const URL_MEDIA_SCHEDULER_POLICY: UrlMediaSchedulerPolicy = {
  perOrigin: 4, perPage: 8, fairnessInterval: 8, random: Math.random,
};

/** Return a server deadline verbatim, including valid long waits. */
export function retryAfterDeadline(value: string | null, now: number): number | null {
  if (value === null || value.trim() === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds >= 0 ? now + seconds * 1000 : null;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(now, date) : null;
}

/**
 * Page-level transfer admission. A slot covers fetch AND body consumption, never decoding.
 * Every eighth dispatch selects the oldest eligible job regardless of priority. Thus an
 * eligible job with N older eligible jobs gets an opportunity within 8*(N+1) dispatches,
 * even if foreground arrivals continue indefinitely. FIFO holds within each priority.
 */
export class UrlMediaScheduler {
  private readonly policy: UrlMediaSchedulerPolicy;
  private queue: Job[] = [];
  private active = 0;
  private origins = new Map<string, number>();
  private cooldowns = new Map<string, number>();
  private order = 0;
  private dispatches = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(policy: Partial<UrlMediaSchedulerPolicy> = {}) {
    this.policy = { ...URL_MEDIA_SCHEDULER_POLICY, ...policy };
    for (const key of ['perOrigin', 'perPage', 'fairnessInterval'] as const) {
      this.policy[key] = Math.max(1, Math.floor(this.policy[key]) || 1);
    }
  }

  transfer(url: string, options: TransferOptions): Promise<MediaTransferOutcome> {
    if (options.signal.aborted) return Promise.resolve({ kind: 'aborted' });
    let origin: string;
    try { origin = new URL(url, globalThis.location?.href).origin; } catch { return Promise.resolve({ kind: 'failure' }); }
    return new Promise(resolve => {
      const job: Job = {
        url, origin, order: this.order++, options, attempts: 0, active: false, settled: false,
        settle: result => {
          if (job.settled) return;
          job.settled = true;
          options.signal.removeEventListener('abort', cancel);
          resolve(result);
        },
      };
      const cancel = () => {
        // Active fetch/body owns the slot until its abort finishes in run's finally.
        job.settle({ kind: 'aborted' });
        this.queue = this.queue.filter(candidate => candidate !== job);
        this.drain();
      };
      options.signal.addEventListener('abort', cancel, { once: true });
      this.queue.push(job);
      this.drain();
    });
  }

  getStats() {
    return { active: this.active, queued: this.queue.length, origins: Object.fromEntries(this.origins), perOrigin: this.policy.perOrigin, perPage: this.policy.perPage };
  }

  private drain() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const now = Date.now();
    for (const [origin, deadline] of this.cooldowns) if (deadline <= now) this.cooldowns.delete(origin);
    while (this.active < this.policy.perPage) {
      const eligible = this.queue.filter(job => !job.settled
        && (this.origins.get(job.origin) ?? 0) < this.policy.perOrigin
        && (this.cooldowns.get(job.origin) ?? 0) <= now);
      if (eligible.length === 0) break;
      const oldestTurn = (this.dispatches + 1) % this.policy.fairnessInterval === 0;
      eligible.sort((a, b) => (oldestTurn ? 0 : MEDIA_PRIORITY_ORDER[a.options.getPriority()] - MEDIA_PRIORITY_ORDER[b.options.getPriority()]) || a.order - b.order);
      const job = eligible[0];
      this.queue.splice(this.queue.indexOf(job), 1);
      this.dispatches += 1;
      this.active += 1;
      this.origins.set(job.origin, (this.origins.get(job.origin) ?? 0) + 1);
      job.active = true;
      void this.run(job);
    }
    const deadlines = this.queue.map(job => this.cooldowns.get(job.origin) ?? 0).filter(deadline => deadline > now);
    if (deadlines.length > 0) {
      // Browser timers overflow above 2^31-1 ms; wake in chunks without retrying early.
      this.timer = setTimeout(() => this.drain(), Math.min(2_147_483_647, Math.max(1, Math.min(...deadlines) - now)));
    }
  }

  private async run(job: Job) {
    let retry = false;
    try {
      const response = await fetch(job.url, { signal: job.options.signal });
      if (response.status === 429) {
        const now = Date.now();
        const serverDeadline = retryAfterDeadline(response.headers?.get('Retry-After') ?? null, now);
        const fallback = now + Math.min(30_000, 1000 * 2 ** job.attempts) * (0.75 + this.policy.random() * 0.5);
        this.cooldowns.set(job.origin, Math.max(this.cooldowns.get(job.origin) ?? 0, serverDeadline ?? fallback));
        await response.body?.cancel();
        retry = !job.settled && !job.options.signal.aborted && job.attempts < 2;
        if (!retry) job.settle({ kind: 'failure', status: 429 });
      } else if (!response.ok) {
        await response.body?.cancel();
        job.settle(response.status === 404 ? { kind: 'absent' } : { kind: 'failure', status: response.status });
      } else {
        const blob = await response.blob();
        job.settle(job.options.signal.aborted ? { kind: 'aborted' } : { kind: 'success', blob });
      }
    } catch {
      job.settle(job.options.signal.aborted ? { kind: 'aborted' } : { kind: 'failure' });
    } finally {
      job.active = false;
      this.active -= 1;
      const remaining = (this.origins.get(job.origin) ?? 1) - 1;
      if (remaining > 0) this.origins.set(job.origin, remaining);
      else this.origins.delete(job.origin);
      if (retry && !job.settled) {
        job.attempts += 1;
        this.queue.push(job);
      }
      this.drain();
    }
  }
}

export const urlMediaScheduler = new UrlMediaScheduler();
