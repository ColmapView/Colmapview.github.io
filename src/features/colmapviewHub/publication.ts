import { makeHubThumbnail } from './thumbnail';
import { timeoutSignal } from '../../utils/abortSignals';
import { useExportStore } from '../../store';
import { isPublishedBucketPublic } from '../bucketStorage/publicAccess';

export const HUB_BASE_URL = 'https://colmapview.opsiclear.com/hub';
export interface HubLicense { id?: string; name?: string; url?: string }
export interface HubMetadata { title: string; description?: string; license?: HubLicense }
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
}
interface LinkResponse { url: string; managementPath: string }
interface Dependencies {
  thumbnail?: typeof makeHubThumbnail;
  request?: (input: LinkInput) => Promise<LinkResponse>;
  capture?: () => Promise<Blob | null>;
  publicAccess?: (viewerUrl: string) => Promise<boolean>;
}

/** Local publishing uses the hosted viewer for its public card; source URL and settings stay intact. */
export function hubViewerUrl(value: string): string {
  const url = new URL(value);
  if (['localhost', '127.0.0.1'].includes(url.hostname)) {
    const hosted = new URL('https://colmapview.opsiclear.com/');
    hosted.search = url.search;
    hosted.hash = url.hash;
    return hosted.href;
  }
  return url.href;
}

async function requestLink(input: LinkInput): Promise<LinkResponse> {
  const response = await fetch(`${HUB_BASE_URL}/api/links`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: timeoutSignal(15000),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'The Hub could not save this link.';
    throw new Error(error);
  }
  if (!result || typeof result !== 'object' || !('url' in result) || typeof result.url !== 'string'
    || !('managementPath' in result) || typeof result.managementPath !== 'string') throw new Error('The Hub returned an invalid link.');
  const url = new URL(result.url);
  const management = new URL(result.managementPath, HUB_BASE_URL);
  if (url.origin !== new URL(HUB_BASE_URL).origin || !url.pathname.startsWith('/hub/') || management.origin !== url.origin
    || !management.pathname.startsWith('/hub/manage/')) throw new Error('The Hub returned an invalid link.');
  return { url: url.href, managementPath: management.href };
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
  const capture = deps.capture ?? (() => useExportStore.getState().getScreenshotBlob?.() ?? Promise.resolve(null));
  const finish = async (viewerUrl: string, retry = false): Promise<void> => {
    if (!draft || state.phase === 'creating' || (!retry && state.viewerUrl === viewerUrl)) return;
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
        viewerUrl: hubViewerUrl(viewerUrl), title: metadata.title.trim().slice(0, 120),
        description: (metadata.description ?? '').trim().slice(0, 280),
        thumbnailBase64: await thumbnail(preview), managementSecret: draft.secret,
        listed: draft.options.listed, publicAcknowledged: true,
        ...(metadata.license ? { license: metadata.license } : {}),
      };
      const result = await request(input);
      set({ phase: 'ready', viewerUrl, url: result.url, managementUrl: `${new URL(result.managementPath, HUB_BASE_URL).href}#${draft.secret}` });
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
      draft = options ? { metadata: structuredClone(metadata), options: { ...options },
        preview: options.preview ? Promise.resolve(options.preview) : Promise.resolve().then(capture).catch(() => null),
        secret: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') } : null;
      set({ phase: 'idle' });
    },
    finish,
    retry: () => state.viewerUrl ? finish(state.viewerUrl, true) : Promise.resolve(),
  };
}

export const hubPublications = {
  huggingFace: createHubPublication(),
  googleDrive: createHubPublication(),
  bucket: createHubPublication({ publicAccess: isPublishedBucketPublic }),
};
export type HubPublication = ReturnType<typeof createHubPublication>;
