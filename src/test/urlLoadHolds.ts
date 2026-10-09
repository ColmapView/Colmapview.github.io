import { vi } from 'vitest';
import { useReconstructionStore } from '../store/reconstructionStore';
import { processFileDropzoneFiles } from '../hooks/fileDropzoneWorkflow';
import { noopLogger } from '../utils/logger';
import type { UrlLoadProgress } from '../types/manifest';

// A test that mocks fileDropzoneWorkflow hands this helper that mock too.
/** A URL load that has parsed its files and is settling its saved settings: the scene on screen is still the old one. */
export function holdUrlLoadBeforeSceneCommit() {
  const store = useReconstructionStore.getState;
  const signal = store().tryStartUrlLoad()!;
  const settings: UrlLoadProgress = { percent: 90, message: 'Loading saved view settings...' };
  const pending = processFileDropzoneFiles(new Map([['photo.jpg', new File(['jpg'], 'photo.jpg')]]), {
    addNotification: vi.fn(), clearCaches: vi.fn(), getLoadedFiles: () => store().loadedFiles,
    getMinTrackLength: () => 1, getSourceInfo: () => ({ sourceType: 'url', imageUrlBase: null }),
    getUrlLoading: () => store().urlLoading, logger: noopLogger, resetView: vi.fn(), setDroppedFiles: vi.fn(),
    setError: vi.fn(), setLoadedFiles: vi.fn(), setReconstruction: vi.fn(), setUrlLoading: store().setUrlLoading,
    setUrlProgress: store().setUrlProgress, setWasmReconstruction: vi.fn(),
  }, {
    signal,
    beforeSceneCommit: () => {
      store().setUrlProgress(settings);
      // Like the settings fetch, it ends only when the load is cancelled.
      return new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    },
  });
  return { pending, settings };
}
