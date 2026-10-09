import { useReconstructionStore } from '../store/reconstructionStore';

type ReconstructionState = ReturnType<typeof useReconstructionStore.getState>;

export const URL_LOAD_GUARD_MESSAGE = '[URL Loader] Already loading (sync guard), ignoring duplicate request';

/** The store's one URL load, held until it finishes, is cancelled or the scene is cleared. */
export interface UrlLoadClaim {
  signal: AbortSignal;
  isCurrent: () => boolean;
  /** Throws an AbortError once this load is no longer current. */
  assertCurrent: () => void;
}

/** Claims the URL load, or returns null while another load holds it. */
export function claimUrlLoad(): UrlLoadClaim | null {
  const signal = useReconstructionStore.getState().tryStartUrlLoad();
  if (!signal) return null;
  const isCurrent = () => !signal.aborted
    && useReconstructionStore.getState().urlLoadController?.signal === signal;
  const assertCurrent = () => {
    if (!isCurrent()) throw new DOMException('Dataset load cancelled', 'AbortError');
  };
  return { signal, isCurrent, assertCurrent };
}

/**
 * An outer UI job before a URL load, such as reading a manifest file: it returns the load to run. That
 * load takes `initialSplatSelectionRevision`, read before the job, so a splat chosen meanwhile stands.
 */
export type UrlLoadPreparation = (
  assertCurrent: () => void,
  initialSplatSelectionRevision: number,
) => Promise<() => Promise<unknown>>;

/**
 * Runs `prepare` under the URL load's claim, behind the loading overlay and its Cancel, then hands the
 * claim to the load it returns. Does nothing while another load holds the claim, and reports a failure
 * only while this job is still current.
 */
export async function runUrlLoadPreparation(
  { setError, setUrlLoading, setUrlProgress }: Pick<ReconstructionState, 'setError' | 'setUrlLoading' | 'setUrlProgress'>,
  message: string,
  prepare: UrlLoadPreparation,
): Promise<void> {
  const claim = claimUrlLoad();
  if (!claim) return;
  const { signal, isCurrent, assertCurrent } = claim;
  const initialSplatSelectionRevision = useReconstructionStore.getState().splatSelectionRevision;
  setUrlLoading(true);
  setUrlProgress({ percent: 0, message });
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    assertCurrent();
    const load = await prepare(assertCurrent, initialSplatSelectionRevision);
    assertCurrent();
    // Transfer ownership synchronously to the loader after preparation succeeds.
    useReconstructionStore.getState().finishUrlLoad(signal);
    await load();
  } catch (err) {
    if (isCurrent()) {
      setError(err instanceof Error ? err.message : 'Failed to load dataset');
    }
  } finally {
    if (isCurrent()) {
      useReconstructionStore.getState().finishUrlLoad(signal);
      setUrlLoading(false);
    }
  }
}
