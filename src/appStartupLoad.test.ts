import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runStartupLoadPlan } from './appStartupLoad';
import { startupLinkRetry } from './appStartupRetry';
import { getAppStartupLoadPlan } from './appStartupPolicy';
import { useCameraStore, useReconstructionStore } from './store';
import { clearUrlLoadAttempt } from './utils/urlLoadAttemptGuard';
import { createDefaultManifest } from './hooks/urlLoaderPolicy';
import { loadBrowsedDirectory, loadDropPayload } from './hooks/fileDropzoneLocalSources';
import { buildFile, buildFileSystemDirectoryHandle } from './test/builders';
import { appLogger } from './utils/logger';
import type { UrlLoadError } from './types/manifest';

const datasetUrl = 'https://huggingface.co/datasets/owner/private';
const accessDenied: UrlLoadError = { type: 'unknown', message: 'Hugging Face dataset not found, or it is private.' };
const sharedLink = (manifestUrl: string | null, manifest = null as ReturnType<typeof createDefaultManifest> | null) =>
  getAppStartupLoadPlan({ shareData: { manifestUrl, manifest, viewState: null, config: { camera: { selectedImageId: 7 } } },
    legacyManifestUrl: null });
/** Like runLoad: a new attempt clears the previous error; a failure records its own. */
const loader = (...outcomes: boolean[]) => vi.fn(async () => {
  useReconstructionStore.getState().setUrlError(null);
  const loaded = outcomes.shift() ?? true;
  if (!loaded) useReconstructionStore.getState().setUrlError({ ...accessDenied });
  return loaded;
});

/** The landing page's local loaders, with their default load lifecycle; only the UI and file system are stubbed. */
function localSourceDeps() {
  return {
    isLoading: () => false,
    setUrlLoading: vi.fn(),
    setUrlProgress: vi.fn(),
    setError: vi.fn(),
    setSourceInfo: vi.fn(),
    clearCaches: vi.fn(),
    processFiles: vi.fn(async () => false),
    waitForPaint: async () => {},
    log: vi.fn(),
    errorLog: vi.fn(),
  };
}

function reset() {
  clearUrlLoadAttempt();
  useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  useCameraStore.setState(useCameraStore.getInitialState(), true);
}
beforeEach(() => {
  reset();
  vi.spyOn(appLogger, 'info').mockImplementation(() => undefined);
});
afterEach(() => {
  reset();
  vi.restoreAllMocks();
});

describe('startup link loading', () => {
  it('keeps a failed shared link retryable in this tab, with its settings and selection', async () => {
    const loadFromUrl = loader(false, true);
    await runStartupLoadPlan(sharedLink(datasetUrl), { loadFromUrl, loadFromManifest: vi.fn() });
    const retry = startupLinkRetry.getSnapshot();
    expect(retry).not.toBeNull();
    useCameraStore.setState({ selectedImageId: null });
    await retry!();
    expect(loadFromUrl.mock.calls).toEqual([[datasetUrl], [datasetUrl]]);
    expect(useCameraStore.getState().selectedImageId).toBe(7);
    expect(startupLinkRetry.getSnapshot()).toBeNull();
  });

  it('retries a shared inline manifest the same way', async () => {
    const manifest = createDefaultManifest(datasetUrl + '/resolve/main/');
    const loadFromManifest = loader(false, true);
    await runStartupLoadPlan(sharedLink(null, manifest), { loadFromUrl: vi.fn(), loadFromManifest });
    await startupLinkRetry.getSnapshot()!();
    expect(loadFromManifest.mock.calls).toEqual([[manifest], [manifest]]);
  });

  it('offers it again when the retry fails too', async () => {
    const loadFromUrl = loader(false, false);
    await runStartupLoadPlan(sharedLink(datasetUrl), { loadFromUrl, loadFromManifest: vi.fn() });
    await startupLinkRetry.getSnapshot()!();
    expect(startupLinkRetry.getSnapshot()).not.toBeNull();
  });

  it('offers nothing when the link was cancelled or refused, which leaves no error', async () => {
    await runStartupLoadPlan(sharedLink(datasetUrl), { loadFromUrl: vi.fn(async () => false), loadFromManifest: vi.fn() });
    expect(startupLinkRetry.getSnapshot()).toBeNull();
  });

  it('withdraws the retry once any other load starts or the viewer is cleared', async () => {
    await runStartupLoadPlan(sharedLink(datasetUrl), { loadFromUrl: loader(false), loadFromManifest: vi.fn() });
    expect(startupLinkRetry.getSnapshot()).not.toBeNull();
    useReconstructionStore.getState().setUrlError(null);
    expect(startupLinkRetry.getSnapshot()).toBeNull();
    await runStartupLoadPlan(sharedLink(datasetUrl), { loadFromUrl: loader(false), loadFromManifest: vi.fn() });
    useReconstructionStore.getState().clear();
    expect(startupLinkRetry.getSnapshot()).toBeNull();
  });

  // Local loads never touch urlError, so only the load lifecycle sees them start.
  it.each([
    ['a dropped folder that fails', (deps: ReturnType<typeof localSourceDeps>) => loadDropPayload(
      { entries: [], fallbackFiles: [buildFile('cameras.bin')], singleFile: null },
      { ...deps, collectDroppedFiles: async () => { throw new Error('Unreadable folder'); },
        isArchiveFile: () => false, processZipFile: vi.fn(), scanEntry: vi.fn() })],
    ['a browsed folder that fails to scan', (deps: ReturnType<typeof localSourceDeps>) => loadBrowsedDirectory(
      { ...deps, pickDirectory: async () => buildFileSystemDirectoryHandle(),
        scanDirectoryHandle: async () => { throw new Error('Unreadable folder'); } })],
  ])('withdraws the retry once a local load starts: %s', async (_name, startLocalLoad) => {
    await runStartupLoadPlan(sharedLink(datasetUrl), { loadFromUrl: loader(false), loadFromManifest: vi.fn() });
    expect(startupLinkRetry.getSnapshot()).not.toBeNull();
    const deps = localSourceDeps();
    await expect(startLocalLoad(deps)).resolves.toBe(false);
    expect(deps.setError).toHaveBeenCalledWith('Unreadable folder');
    // The shared link's failure is still the one the landing page shows.
    expect(useReconstructionStore.getState().urlError).toEqual(accessDenied);
    expect(startupLinkRetry.getSnapshot()).toBeNull();
  });

  it('keeps the retry when the folder picker is cancelled, since nothing loads', async () => {
    await runStartupLoadPlan(sharedLink(datasetUrl), { loadFromUrl: loader(false), loadFromManifest: vi.fn() });
    const deps = localSourceDeps();
    await expect(loadBrowsedDirectory({ ...deps, scanDirectoryHandle: vi.fn(),
      pickDirectory: async () => { throw new DOMException('The user aborted a request.', 'AbortError'); } })).resolves.toBe(false);
    expect(startupLinkRetry.getSnapshot()).not.toBeNull();
    expect(useReconstructionStore.getState().urlError).toEqual(accessDenied);
    expect(deps.setError).not.toHaveBeenCalled();
  });
});
