import { useSyncExternalStore } from 'react';
import { hfAuth } from '../../features/huggingface/auth';

/** The Hugging Face session the read-only toolbar account button shows. */
export function useHuggingFaceAccountStoreFacade() {
  const hf = useSyncExternalStore(hfAuth.subscribe, hfAuth.getSnapshot);
  return { hf };
}
