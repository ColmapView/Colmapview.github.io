import { getHubBaseUrl } from './config';
import { makeHubThumbnail } from './thumbnail';
import { timeoutSignal } from '../../utils/abortSignals';
import { useExportStore } from '../../store';
import { isPublishedBucketPublic } from '../bucketStorage/publicAccess';
import type { PublicationAssetSummary } from '../datasetPublishing/types';

export interface HubLicense { id?: string; name?: string; url?: string }
export interface HubMetadata { title: string; description?: string; license?: HubLicense; assets?: PublicationAssetSummary }
export interface HubPublicationOptions { listed: boolean; preview?: File }
export interface HubLinkState {
  phase: 'idle' | 'creating' | 'ready' | 'failed';
  viewerUrl?: string;
  url?: string;
  managementUrl?: string;
  error?: string;
}
interface LinkInput {
  viewerUrl: string; title: string; description: string; thumbnailBase64: string;
  managementSecret: string; listed: boolean; publicAcknowledged: true; license?: HubLicense;
  assets?: PublicationAssetSummary;
}
interface LinkResponse { url: string; managementUrl: string }
interface Dependencies {
  baseUrl?: () => string | null;
  thumbnail?: typeof makeHubThumbnail;
  request?: (baseUrl: string, input: LinkInput) => Promise<LinkResponse>;
  capture?: () => Promise<Blob | null>;
  publicAccess?: (viewerUrl: string) => Promise<boolean>;
}

/** Null instead of a TypeError, so a relative or malformed Hub answer fails as an invalid link. */
function parseUrl(value: string, base?: string): URL | null {
  try { return new URL(value, base); } catch { return null; }
}

async function requestLink(baseUrl: string, input: LinkInput): Promise<LinkResponse> {
  const response = await fetch(`${baseUrl}/api/links`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: timeoutSignal(15000),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'The Hub could not save this link.';
    throw new Error(error);
  }
  if (!result || typeof result !== 'object' || !('url' in result) || typeof result.url !== 'string'
    || !('managementPath' in result) || typeof result.managementPath !== 'string') throw new Error('The Hub returned an invalid link.');
  const root = `${baseUrl}/`;
  const url = parseUrl(result.url);
  const management = parseUrl(result.managementPath, root);
  if (!url?.href.startsWith(root) || !management?.href.startsWith(`${root}manage/`)) throw new Error('The Hub returned an invalid link.');
  return { url: url.href, managementUrl: management.href };
}

/** Automatic step after a public storage upload. Retries keep the ownership key and exact payload. */
export function createHubPublication(deps: Dependencies = {}) {
  let state: HubLinkState = { phase: 'idle' };
  let draft: { metadata: HubMetadata; options: HubPublicationOptions; secret: string; preview: Promise<Blob | null> } | null = null;
  let input: LinkInput | null = null;
  const listeners = new Set<() => void>();
  const set = (next: HubLinkState) => { state = next; listeners.forEach(listener => listener()); };
  const thumbnail = deps.thumbnail ?? makeHubThumbnail;
  const request = deps.request ?? requestLink;
  const baseUrl = deps.baseUrl ?? (() => getHubBaseUrl());
  const capture = deps.capture ?? (() => useExportStore.getState().getScreenshotBlob?.() ?? Promise.resolve(null));
  const finish = async (viewerUrl: string, retry = false): Promise<void> => {
    const base = baseUrl();
    if (!base || !draft || state.phase === 'creating' || (!retry && state.viewerUrl === viewerUrl)) return;
    set({ phase: 'creating', viewerUrl });
    try {
      if (deps.publicAccess && !await deps.publicAccess(viewerUrl)) {
        draft = null;
        set({ phase: 'idle', viewerUrl });
        return;
      }
      const metadata = draft.metadata;
      const preview = await draft.preview;
      if (!preview) throw new Error('The upload preview is unavailable.');
      input ??= {
        viewerUrl, title: metadata.title.trim().slice(0, 120),
        description: (metadata.description ?? '').trim().slice(0, 280),
        thumbnailBase64: await thumbnail(preview), managementSecret: draft.secret,
        listed: draft.options.listed, publicAcknowledged: true,
        ...(metadata.license ? { license: metadata.license } : {}),
        ...(metadata.assets ? { assets: metadata.assets } : {}),
      };
      const result = await request(base, input);
      set({ phase: 'ready', viewerUrl, url: result.url, managementUrl: `${result.managementUrl}#${draft.secret}` });
    } catch (error) {
      set({ phase: 'failed', viewerUrl, error: error instanceof Error ? error.message : 'The Hub could not save this link.' });
    }
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    prepare(metadata: HubMetadata, options?: HubPublicationOptions) {
      if (state.phase === 'creating') throw new Error('Wait for the current short link to finish.');
      input = null;
      draft = options && baseUrl() ? { metadata: structuredClone(metadata), options: { ...options },
        preview: options.preview ? Promise.resolve(options.preview) : Promise.resolve().then(capture).catch(() => null),
        secret: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') } : null;
      set({ phase: 'idle' });
    },
    finish(viewerUrl: string, assets?: PublicationAssetSummary) {
      if (draft && assets && state.phase === 'idle') draft.metadata.assets = structuredClone(assets);
      return finish(viewerUrl);
    },
    retry: () => state.viewerUrl ? finish(state.viewerUrl, true) : Promise.resolve(),
  };
}

export const hubPublications = {
  huggingFace: createHubPublication(),
  googleDrive: createHubPublication(),
  bucket: createHubPublication({ publicAccess: isPublishedBucketPublic }),
};
export type HubPublication = ReturnType<typeof createHubPublication>;
