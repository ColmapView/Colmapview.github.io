import { useReconstructionStore } from './store';
import { clearUrlLoadRequestFromLocation } from './store/reconstructionStore';
import { onReconstructionLoadStart } from './wasm/reconstructionLoadLifecycle';

type Retry = () => Promise<void>;

const listeners = new Set<() => void>();
let current: Retry | null = null;
let release = () => {};

function publish(next: Retry | null): void {
  release();
  release = () => {};
  current = next;
  for (const listener of listeners) listener();
}

/** A failed startup or shared link that this tab can run again, for example after signing in. */
export const startupLinkRetry = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getSnapshot: (): Retry | null => current,
};

/** Kept while its failure is the one on screen: any later load, success or clear withdraws it. */
export function offerStartupLinkRetry(run: Retry): void { offerRetry(run, true); }

/** URL dialog and file-manifest loads retain their exact command too. */
export function offerUrlLoadRetry(run: Retry): void { offerRetry(run, false); }

function offerRetry(run: Retry, clearLocation: boolean): void {
  const failure = useReconstructionStore.getState().urlError;
  if (!failure) return;
  const retry: Retry = () => {
    publish(null);
    return run();
  };
  // The retry reads the link from the address bar. Withdrawn, the dead link leaves it, so neither a
  // page reload nor the next scene's camera restore runs it again.
  const abandon = () => {
    publish(null);
    if (clearLocation) clearUrlLoadRequestFromLocation();
  };
  publish(retry);
  const stopWatchingError = useReconstructionStore.subscribe(state => {
    if (state.urlError !== failure) abandon();
  });
  // A local load never touches urlError, so its start is seen through the load lifecycle.
  const stopWatchingLoads = onReconstructionLoadStart(abandon);
  release = () => { stopWatchingError(); stopWatchingLoads(); };
}
