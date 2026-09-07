import { create } from 'zustand';
import { z } from 'zod';
import { useReconstructionStore } from '../store/reconstructionStore';

export const datasetLoadInput = z.strictObject({ url: z.string().max(8192).url().refine(value => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}, 'Use an HTTP(S) URL without embedded credentials.') });
type LoadJob = { id: string; url: string; status: 'running' | 'succeeded' | 'failed'; error?: string };
export const useDatasetLoad = create<{ job: LoadJob | null }>(() => ({ job: null }));
let loader: ((url: string) => Promise<boolean>) | undefined;

/** Register the same URL loader used by the mounted human load panel. */
export function registerDatasetLoader(callback: (url: string) => Promise<boolean>) {
  loader = callback;
  return () => { if (loader === callback) loader = undefined; };
}
export function canLoadDataset() {
  const state = useReconstructionStore.getState();
  return !!loader && useDatasetLoad.getState().job?.status !== 'running'
    && !state.loading && !state.urlLoading && !state.urlLoadActive;
}
export function startDatasetLoad(raw: unknown) {
  const { url } = datasetLoadInput.parse(raw);
  if (!canLoadDataset() || !loader) throw new Error('Dataset loader is unavailable or another load is in progress.');
  const job: LoadJob = { id: crypto.randomUUID(), url, status: 'running' };
  const load = loader;
  useDatasetLoad.setState({ job });
  // Acceptance is synchronous and idempotent through the command runtime. The
  // existing loader owns the accepted operation; revocation prevents new commands
  // but cannot cancel or roll back a load already in progress.
  try {
    void load(url).then(success => {
      useDatasetLoad.setState({ job: { ...job, status: success ? 'succeeded' : 'failed',
        ...(!success ? { error: useReconstructionStore.getState().urlError?.message ?? 'Dataset loading failed.' } : {}) } });
    }, error => {
      useDatasetLoad.setState({ job: { ...job, status: 'failed', error: error instanceof Error ? error.message : 'Dataset loading failed.' } });
    });
  } catch (error) {
    useDatasetLoad.setState({ job: { ...job, status: 'failed', error: error instanceof Error ? error.message : 'Dataset loading failed.' } });
  }
}
