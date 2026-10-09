import { reconstructionAbortError } from './reconstructionService';

let generation = 0;
let active: AbortController | null = null;
const committedScenes = new WeakSet<AbortSignal>();
const startListeners = new Set<() => void>();

/** Called whenever a dataset load starts, local or from a URL, including one that later fails or is cancelled. */
export function onReconstructionLoadStart(listener: () => void): () => void {
  startListeners.add(listener);
  return () => { startListeners.delete(listener); };
}

/** A replacement/clear immediately aborts the previous load, including a busy parsing worker. */
export function beginReconstructionLoad(): { signal: AbortSignal; assertCurrent(): void; finish(): void } {
  active?.abort();
  const controller = new AbortController();
  const token = ++generation;
  active = controller;
  for (const listener of Array.from(startListeners)) listener();
  return {
    signal: controller.signal,
    assertCurrent: () => {
      if (controller.signal.aborted || token !== generation) throw reconstructionAbortError();
    },
    finish: () => { if (active === controller) active = null; },
  };
}

/** Changes whenever a dataset load starts or the pending one is cancelled, for example by a clear. */
export function getReconstructionLoadGeneration(): number {
  return generation;
}

export function cancelPendingReconstructionLoad(): void {
  generation++;
  active?.abort();
  active = null;
}

/** A dataset is being scanned, parsed, committed or restoring its saved view. */
export function isReconstructionLoadPending(): boolean {
  return active !== null;
}

/** Record the scene commit for this load and, for URL loads, the request that continues restoring its view. */
export function markReconstructionSceneCommitted(signal: AbortSignal, sourceSignal?: AbortSignal): void {
  if (active?.signal !== signal || signal.aborted || sourceSignal?.aborted) return;
  committedScenes.add(signal);
  if (sourceSignal) committedScenes.add(sourceSignal);
}

/** An active parser or URL request has installed its scene; its renderer may now own progress for those files. */
export function hasReconstructionSceneCommitted(signal: AbortSignal | null = active?.signal ?? null): boolean {
  return Boolean(signal && !signal.aborted && committedScenes.has(signal));
}
