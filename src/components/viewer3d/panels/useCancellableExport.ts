import { useCallback, useEffect, useMemo, useState } from 'react';

type ExportOperation = (signal: AbortSignal, setProgress: (percent: number | null) => void) => Promise<void>;

/** Own each run so an obsolete completion cannot reset a newer export's progress. */
export function useCancellableExport(source: unknown) {
  const owner = useMemo(() => ({ source, controller: null as AbortController | null }), [source]);
  const [state, setState] = useState<{ owner: typeof owner; progress: number | null }>({ owner, progress: null });
  if (state.owner !== owner) setState({ owner, progress: null });
  const cancel = useCallback(() => {
    owner.controller?.abort();
    owner.controller = null;
    setState({ owner, progress: null });
  }, [owner]);
  useEffect(() => () => {
    owner.controller?.abort();
    owner.controller = null;
  }, [owner]);

  const run = useCallback(async (operation: ExportOperation) => {
    if (owner.controller) return;
    const controller = new AbortController();
    owner.controller = controller;
    const setProgress = (progress: number | null) => {
      if (owner.controller === controller && !controller.signal.aborted) setState({ owner, progress });
    };
    setProgress(0);
    try {
      await operation(controller.signal, setProgress);
    } finally {
      if (owner.controller === controller) {
        owner.controller = null;
        setState({ owner, progress: null });
      }
    }
  }, [owner]);

  return { progress: state.owner === owner ? state.progress : null, run, cancel };
}
