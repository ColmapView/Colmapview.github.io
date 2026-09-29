import type { ColmapManifest } from '../types/manifest';
import { MAX_VIEWER_STATE_BYTES, parsePublishedViewerState, readBoundedResponse, type PublishedViewerState } from '../utils/publishedViewerState';
import { joinManifestUrlPath } from './urlLoaderPolicy';
import { DATASET_VIEWER_SETTINGS_FILE, parseDatasetViewerSettings } from '../utils/datasetViewerSettings';
import { huggingFaceSettingsUrls, normalizeHuggingFaceDatasetUrl } from '../utils/huggingFaceUrl';
import { appLogger } from '../utils/logger';
import { normalizeSplatSourceId } from '../utils/splatFileSourcePolicy';
import type { ShareConfig } from '../utils/shareDataCodec';

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

export async function fetchDatasetViewerSettings(url: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, isFile = false): Promise<PublishedViewerState | null> {
  // The first candidate sits beside the loaded project or file; later ones are parent folders.
  for (const [index, candidate] of settingsUrls(url, isFile).entries()) {
    try {
      const response = await fetchImpl(candidate, { credentials: 'omit' });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 404) continue;
        return null;
      }
      const text = await (await readBoundedResponse(response, MAX_VIEWER_STATE_BYTES)).text();
      const state = parseDatasetViewerSettings(text);
      return index === 0 || (isFile && savesFileAsActiveSplat(state, candidate, url)) ? state : displaySettingsOnly(state);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') throw error;
      appLogger.warn('[URL Loader] Skipping unavailable or invalid colmapview.yaml settings.');
      return null;
    }
  }
  return null;
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
