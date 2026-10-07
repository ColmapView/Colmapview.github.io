import type { ColmapManifest } from '../types/manifest';
import { MAX_VIEWER_STATE_BYTES, parsePublishedViewerState, readBoundedResponse, type PublishedViewerState } from '../utils/publishedViewerState';
import { joinManifestUrlPath } from './urlLoaderPolicy';
import { DATASET_VIEWER_SETTINGS_FILE, parseDatasetViewerSettings } from '../utils/datasetViewerSettings';
import { huggingFaceSettingsUrls, normalizeHuggingFaceDatasetUrl } from '../utils/huggingFaceUrl';
import { appLogger } from '../utils/logger';
import { normalizeSplatSourceId } from '../utils/splatFileSourcePolicy';
import type { ShareConfig } from '../utils/shareDataCodec';
import { anySignal } from '../utils/abortSignals';

export const OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS = 3_000;

export const SKIPPED_SETTINGS_WARNING = '[URL Loader] Skipping unavailable or invalid colmapview.yaml settings.';

export interface OptionalViewerSettingsResult { state: PublishedViewerState | null; timedOut: boolean }

/** Automatic settings discovery: the request starts now, its deadline when the result is needed. */
export interface OptionalViewerSettingsRequest {
  /** Resolves within OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS of the first call; a stalled request is aborted. */
  settle(): Promise<OptionalViewerSettingsResult>;
  cancel(): void;
}

export function startOptionalDatasetViewerSettings(url: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, isFile = false,
  signal?: AbortSignal): OptionalViewerSettingsRequest {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const requestSignal = signal ? anySignal([signal, controller.signal]) : controller.signal;
  const settings = readDatasetViewerSettings(url, (candidate, init) => fetchImpl(candidate,
    { ...init, signal: init?.signal ? anySignal([requestSignal, init.signal]) : requestSignal }), isFile)
    .catch((error): OptionalViewerSettingsResult => {
      // Only the load's own cancellation is fatal. Our deadline and the transport's timeout
      // (which some engines report as a plain AbortError) leave the defaults in place.
      if (!signal?.aborted) return { state: null, timedOut: true };
      throw error;
    });
  // A failure before settle() is reported by settle(), not as an unhandled rejection.
  settings.catch(() => {});
  let result: Promise<OptionalViewerSettingsResult> | null = null;
  const settleWithDeadline = async (): Promise<OptionalViewerSettingsResult> => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let cancel: (() => void) | undefined;
    const deadline = new Promise<OptionalViewerSettingsResult>((resolve, reject) => {
      cancel = () => reject(signal?.reason ?? new DOMException('Dataset load cancelled', 'AbortError'));
      if (signal?.aborted) { cancel(); return; }
      signal?.addEventListener('abort', cancel, { once: true });
      timeout = setTimeout(() => {
        controller.abort(new DOMException('Optional viewer settings timed out', 'TimeoutError'));
        resolve({ state: null, timedOut: true });
      }, OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS);
    });
    try {
      return await Promise.race([settings, deadline]);
    } finally {
      clearTimeout(timeout);
      if (cancel) signal?.removeEventListener('abort', cancel);
      controller.abort();
    }
  };
  return {
    settle: () => (result ??= settleWithDeadline()),
    cancel: () => controller.abort(),
  };
}

export async function fetchOptionalDatasetViewerSettingsResult(url: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, isFile = false,
  signal?: AbortSignal): Promise<OptionalViewerSettingsResult> {
  const request = startOptionalDatasetViewerSettings(url, fetchImpl, isFile, signal);
  try {
    return await request.settle();
  } finally {
    request.cancel();
  }
}

function settingsUrls(value: string, isFile: boolean): string[] {
  const hfUrls = huggingFaceSettingsUrls(value, DATASET_VIEWER_SETTINGS_FILE, isFile);
  if (hfUrls.length) return hfUrls;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return [];
    url.search = '';
    url.hash = '';
    if (!isFile && !url.pathname.endsWith('/')) url.pathname += '/';
    return [new URL(DATASET_VIEWER_SETTINGS_FILE, url).href];
  } catch { return []; }
}

/** Settings in a parent folder may describe a different project: keep only how things look. */
function displaySettingsOnly(state: PublishedViewerState): PublishedViewerState {
  const config: ShareConfig = { ...state.config };
  delete config.transform;
  delete config.splat;
  if (config.camera) {
    config.camera = { ...config.camera };
    delete config.camera.selectedImageId;
  }
  return { ...state, viewState: null, config };
}

/** A parent folder's settings still describe the splat file they saved as the active one. */
function savesFileAsActiveSplat(state: PublishedViewerState, settingsUrl: string, fileUrl: string): boolean {
  const active = state.config.splat?.activeSourceId;
  const file = normalizeHuggingFaceDatasetUrl(fileUrl);
  if (!active || !file) return false;
  const folder = new URL('.', settingsUrl).pathname;
  const path = new URL(file).pathname;
  try {
    return path.startsWith(folder) && decodeURIComponent(path.slice(folder.length)) === normalizeSplatSourceId(active);
  } catch { return false; }
}

/** The candidate search; also says whether a stalled request (transport timeout) hid the settings. */
async function readDatasetViewerSettings(url: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, isFile: boolean): Promise<OptionalViewerSettingsResult> {
  // The first candidate sits beside the loaded project or file; later ones are parent folders.
  // All are requested at once, so a deep path costs one round trip; the nearest answer still decides.
  const unneeded = new AbortController();
  const requests = settingsUrls(url, isFile).map(candidate => {
    const response = fetchImpl(candidate, { credentials: 'omit', signal: unneeded.signal });
    response.catch(() => {});
    return { candidate, response };
  });
  try {
    for (const [index, { candidate, response: pending }] of requests.entries()) {
      try {
        const response = await pending;
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 404) continue;
          return { state: null, timedOut: false };
        }
        const text = await (await readBoundedResponse(response, MAX_VIEWER_STATE_BYTES)).text();
        const state = parseDatasetViewerSettings(text);
        return {
          state: index === 0 || (isFile && savesFileAsActiveSplat(state, candidate, url)) ? state : displaySettingsOnly(state),
          timedOut: false,
        };
      } catch (error) {
        const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
        if (name === 'AbortError') throw error;
        appLogger.warn(SKIPPED_SETTINGS_WARNING);
        return { state: null, timedOut: name === 'TimeoutError' };
      }
    }
    return { state: null, timedOut: false };
  } finally {
    // Folders above the deciding answer are no longer needed.
    unneeded.abort();
  }
}

export async function fetchDatasetViewerSettings(url: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, isFile = false): Promise<PublishedViewerState | null> {
  return (await readDatasetViewerSettings(url, fetchImpl, isFile)).state;
}

export async function fetchPublishedViewerState(manifest: ColmapManifest,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>): Promise<PublishedViewerState | null> {
  const path = manifest.viewerStatePath;
  if (path === undefined) return fetchDatasetViewerSettings(manifest.baseUrl, fetchImpl);
  if (path.startsWith('/') || path.includes('\\') || /^[a-z]+:/i.test(path)
    || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid published viewer state path');
  const response = await fetchImpl(joinManifestUrlPath(manifest.baseUrl, path), { credentials: 'omit' });
  const blob = await readBoundedResponse(response, MAX_VIEWER_STATE_BYTES);
  try {
    const text = await blob.text();
    return /\.ya?ml$/i.test(path) ? parseDatasetViewerSettings(text) : parsePublishedViewerState(JSON.parse(text));
  }
  catch { throw new Error('Published viewer state is invalid. Open a compatible ColmapView version or ask the publisher to republish.'); }
}
