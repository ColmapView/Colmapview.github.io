/** One page-level wake signal for imperative and asynchronous scene updates. */
const listeners = new Set<() => void>();
let deferredFrame: ReturnType<typeof setTimeout> | null = null;
let deferredDeadline = Infinity;

export function requestSceneRender(delayMs = 0): void {
  if (listeners.size === 0) return;
  if (delayMs > 0) {
    const deadline = performance.now() + delayMs;
    if (deadline >= deferredDeadline) return;
    if (deferredFrame !== null) clearTimeout(deferredFrame);
    deferredDeadline = deadline;
    deferredFrame = setTimeout(() => {
      deferredFrame = null;
      deferredDeadline = Infinity;
      requestSceneRender();
    }, delayMs);
    return;
  }
  for (const listener of listeners) listener();
}

export function subscribeSceneRenderInvalidation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && deferredFrame !== null) {
      clearTimeout(deferredFrame);
      deferredFrame = null;
      deferredDeadline = Infinity;
    }
  };
}
