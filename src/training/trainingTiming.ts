/** Bounded, in-memory diagnostics. Durations use only the browser clock. */
type Aggregate = { count: number; failed: number; totalMs: number; maxMs: number; active: number; peakActive: number };

export class TrainingTiming {
  private readonly started = performance.now();
  private readonly stages = new Map<string, Aggregate>();
  private readonly marks = new Map<string, number>();
  private readonly counters = new Map<string, number>();
  jobId: string | null = null;

  readonly attemptId: string;
  constructor(attemptId: string) { this.attemptId = attemptId; this.mark('train_click'); }

  mark(name: string): void {
    if (!this.marks.has(name) && this.marks.size < 32) this.marks.set(name, performance.now() - this.started);
  }

  add(name: string, value: number): void {
    if (this.counters.has(name) || this.counters.size < 32) {
      this.counters.set(name, (this.counters.get(name) ?? 0) + value);
    }
  }

  async measure<T>(stage: string, operation: () => Promise<T>): Promise<T> {
    if (!this.stages.has(stage) && this.stages.size >= 32) return operation();
    const value = this.stages.get(stage) ?? { count: 0, failed: 0, totalMs: 0, maxMs: 0, active: 0, peakActive: 0 };
    this.stages.set(stage, value);
    value.active++;
    value.peakActive = Math.max(value.peakActive, value.active);
    const start = performance.now();
    try { return await operation(); }
    catch (error) { value.failed++; throw error; }
    finally {
      const elapsed = performance.now() - start;
      value.active--;
      value.count++;
      value.totalMs += elapsed;
      value.maxMs = Math.max(value.maxMs, elapsed);
    }
  }

  snapshot() {
    return { schemaVersion: 1, clock: 'browser-performance' as const, attemptId: this.attemptId,
      jobId: this.jobId, marksMs: Object.fromEntries(this.marks), counters: Object.fromEntries(this.counters),
      stages: Object.fromEntries([...this.stages].map(([key, value]) => [key, { ...value }])) };
  }
}

let current: TrainingTiming | null = null;
const recent: TrainingTiming[] = [];

export function beginTrainingTiming(attemptId: string): TrainingTiming {
  current = new TrainingTiming(attemptId);
  recent.push(current);
  if (recent.length > 4) recent.shift();
  return current;
}

export function currentTrainingTiming(): TrainingTiming | null { return current; }

/** Only committed UI milestones, keyed to their owning job rather than latest attempt. */
export function observeTrainingMilestone(
  jobId: string,
  milestone: 'first_preview_displayed' | 'final_result_attached',
): void {
  recent.find(trace => trace.jobId === jobId)?.mark(milestone);
}

export function observeTrainingProgress(jobId: string, optimizerStep: number | null | undefined): void {
  if (optimizerStep == null || optimizerStep <= 0) return;
  recent.find(trace => trace.jobId === jobId)?.mark('first_training_progress_observed');
}

/** Diagnostics only; no image data, paths, tokens or persisted UI state. */
export function inspectTrainingTimings() { return recent.map(trace => trace.snapshot()); }
