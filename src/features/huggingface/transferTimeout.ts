import { HfError } from './http';

export const TRANSFER_IDLE_TIMEOUT_MS = 15 * 60_000;

/** Active transfers can take arbitrarily long; only stalled work times out. */
export function createTransferTimeout(signal: AbortSignal) {
  const timeout = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let disposed = false;
  const activity = () => {
    if (disposed || timeout.signal.aborted) return;
    clearTimeout(timer);
    timer = setTimeout(() => timeout.abort(new HfError('The transfer stalled for 15 minutes. Retry to check whether it completed.')), TRANSFER_IDLE_TIMEOUT_MS);
  };
  activity();
  return {
    signal: AbortSignal.any([signal, timeout.signal]),
    activity,
    dispose() { disposed = true; clearTimeout(timer); timeout.abort(); },
  };
}
