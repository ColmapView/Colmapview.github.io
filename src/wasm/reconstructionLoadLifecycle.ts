import { reconstructionAbortError } from './reconstructionService';

let generation = 0;
let active: AbortController | null = null;

/** A replacement/clear immediately aborts the previous load, including a busy parsing worker. */
export function beginReconstructionLoad(): { signal: AbortSignal; assertCurrent(): void; finish(): void } {
  active?.abort();
  const controller = new AbortController();
  const token = ++generation;
  active = controller;
  return {
    signal: controller.signal,
    assertCurrent: () => {
      if (controller.signal.aborted || token !== generation) throw reconstructionAbortError();
    },
    finish: () => { if (active === controller) active = null; },
  };
}

export function cancelPendingReconstructionLoad(): void {
  generation++;
  active?.abort();
  active = null;
}
