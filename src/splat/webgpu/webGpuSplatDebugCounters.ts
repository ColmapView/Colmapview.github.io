export interface WebGpuSplatDebugCounters {
  devices: number;
  canvases: number;
  buffers: number;
  textures: number;
  renderSessions: number;
  psnrSessions: number;
  activePsnrImageJobs: number;
}

export type WebGpuSplatDebugCounterName = keyof WebGpuSplatDebugCounters;

const counters: WebGpuSplatDebugCounters = {
  devices: 0,
  canvases: 0,
  buffers: 0,
  textures: 0,
  renderSessions: 0,
  psnrSessions: 0,
  activePsnrImageJobs: 0,
};

export function getWebGpuSplatDebugCounters(): WebGpuSplatDebugCounters {
  return { ...counters };
}

export function resetWebGpuSplatDebugCountersForTests(): void {
  for (const name of Object.keys(counters) as WebGpuSplatDebugCounterName[]) {
    counters[name] = 0;
  }
}

export function trackWebGpuSplatDebugCounter(
  name: WebGpuSplatDebugCounterName,
  count = 1
): () => void {
  const safeCount = requireNonNegativeInteger(count, `${name} count`);
  counters[name] += safeCount;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    counters[name] = Math.max(0, counters[name] - safeCount);
  };
}

export function releaseWebGpuSplatDebugCounters(releases: Iterable<() => void>): void {
  for (const release of releases) {
    release();
  }
}

export function noopWebGpuSplatDebugCounterRelease(): void {
  // Used as an idempotent placeholder before a resource has been allocated.
}

function requireNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid WebGPU splat debug counter ${name}: expected a non-negative integer`);
  }
  return value;
}
