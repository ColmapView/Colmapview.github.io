import { reconstructionAbortError } from './reconstructionService';

let generation = 0;
let active: AbortController | null = null;
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

/** A dataset is being scanned, parsed or committed; the scene on screen is the one it replaces. */
export function isReconstructionLoadPending(): boolean {
  return active !== null;
}
