import { useSyncExternalStore } from 'react';
import { useReconstructionStore } from '../../store';
import { startupLinkRetry } from '../../appStartupRetry';

export function useStorageAccessPromptStoreFacade() {
  const failure = useReconstructionStore(state => state.urlError);
  const retry = useSyncExternalStore(startupLinkRetry.subscribe, startupLinkRetry.getSnapshot);
  return { failure, retry };
}
