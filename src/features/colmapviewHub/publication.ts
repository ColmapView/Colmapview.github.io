import { makeHubThumbnail } from './thumbnail';
import { getHubBaseUrl } from './config';
import { buildHubPayload, type HubAccess, type HubLinkPayload, type HubMetadata } from './payload';
import { hubShareLinks, sameHubSource, type HubSource } from './hubShareLinks';
import { timeoutSignal } from '../../utils/abortSignals';
import { toBase64Url } from '../../utils/urlCameraStateCodec';
import { retryAfterDeadline } from '../../dataset/urlMediaScheduler';
import { useNotificationStore } from '../../store';
import { bucketAccess, type BucketAccess } from '../bucketStorage/publicAccess';
import type { PublicationAssetSummary } from '../datasetPublishing/types';
import { getHubSource } from '../datasetPublishing/publicationSnapshot';

export type { HubAccess, HubMetadata } from './payload';
export type { BucketAccess } from '../bucketStorage/publicAccess';
export type HubCapture = () => Promise<Blob | null>;
export type HubProvider = 'huggingFace' | 'googleDrive' | 'bucket';
export interface HubPrepareOptions {
  /** 'check' decides after the upload, from the anonymous bucket check. */
  access: HubAccess | 'check';
  source: HubSource;
  preview?: File | null;
  /** Captures the current view when there is no preview, and again on Retry after a preview failure. */
  capture?: HubCapture | null;
}
export type HubFailureKind = 'network' | 'timeout' | 'rate-limited' | 'unavailable' | 'rejected' | 'preview';
export interface HubLinkState {
  phase: 'idle' | 'checking' | 'creating' | 'ready' | 'failed';
  viewerUrl?: string;
  bucketAccess?: BucketAccess;
  url?: string;
  managementUrl?: string;
  error?: string;
  retryable?: boolean;
  /** Set until a 429's Retry-After passes; the controller clears it then. */
  retryAfter?: number;
  deleteLinkSeen?: boolean;
}

export class HubRequestError extends Error {
  // Plain fields: the viewer's erasableSyntaxOnly setting forbids constructor parameter properties.
  readonly kind: HubFailureKind;
  readonly retryAfterMs: number;
  constructor(message: string, kind: HubFailureKind, retryAfterMs = 0) {
    super(message);
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

const RETRYABLE = new Set<HubFailureKind>(['network', 'timeout', 'rate-limited', 'unavailable', 'preview']);
const READY_TOAST = 'Hub link ready. Reopen the upload dialog to copy it and its delete link.';
const FAILED_TOAST = 'Hub link not created. Reopen the upload dialog to retry.';
const INVALID_LINK = 'ColmapView Hub returned an invalid link.';
const SOURCE_CHANGED = "The dataset changed, so its preview can't be captured. Upload again to create a Hub link.";

/** A failure to reach the Hub or to receive its answer: a timeout, or a network error. */
function transportError(error: unknown): HubRequestError {
  const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
  return timedOut ? new HubRequestError("ColmapView Hub didn't respond.", 'timeout') : new HubRequestError("Couldn't reach ColmapView Hub.", 'network');
}

/** POST /api/links with typed failures. The returned links must lie under the configured Hub. */
export async function requestHubLink(baseUrl: string, payload: HubLinkPayload): Promise<{ url: string; managementUrl: string }> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: timeoutSignal(15000) });
  } catch (error) { throw transportError(error); }
  // A body that stops arriving is a transport failure like a failed fetch, so Retry replays the same secret and payload.
  // Only a body that arrived but is not JSON counts as missing fields.
  let body: string | null = null;
  let bodyError: unknown;
  try { body = await response.text(); } catch (error) { bodyError = error ?? new TypeError('Body read failed'); }
  let result: unknown = null;
  if (body !== null) { try { result = JSON.parse(body); } catch { /* not JSON */ } }
  const field = (key: string): unknown => (result && typeof result === 'object' ? (result as Record<string, unknown>)[key] : undefined);
  if (response.status === 429) {
    // Cross-origin callers can read Retry-After only because the Hub exposes it; otherwise wait a minute.
    const now = Date.now();
    const deadline = retryAfterDeadline(response.headers.get('Retry-After'), now);
    const waitMs = deadline !== null && deadline > now ? Math.max(1000, deadline - now) : 60_000;
    throw new HubRequestError(`Too many requests from your network; try again in ${Math.ceil(waitMs / 60_000)} min.`, 'rate-limited', waitMs);
  }
  if (response.status >= 500) throw new HubRequestError('ColmapView Hub is unavailable.', 'unavailable');
  if (bodyError !== undefined) throw transportError(bodyError);
  if (!response.ok) {
    const message = field('error');
    throw new HubRequestError(typeof message === 'string' && message ? message : 'ColmapView Hub rejected this link.', 'rejected');
  }
  const [url, managementPath] = [field('url'), field('managementPath')];
  if (typeof url !== 'string' || typeof managementPath !== 'string') throw new HubRequestError(INVALID_LINK, 'rejected');
  const root = `${baseUrl}/`;
  let link: URL;
  let management: URL;
  try { link = new URL(url); management = new URL(managementPath, root); }
  catch { throw new HubRequestError(INVALID_LINK, 'rejected'); }
  if (!link.href.startsWith(root) || !management.href.startsWith(`${root}manage/`)) throw new HubRequestError(INVALID_LINK, 'rejected');
  return { url: link.href, managementUrl: management.href };
}

interface Draft {
  metadata: HubMetadata;
  access: HubAccess | 'check';
  source: HubSource;
  secret: string;
  capture: HubCapture | null;
  preview: Promise<Blob | null> | null;
  bucketAccess?: BucketAccess;
}

interface Dependencies {
  baseUrl?: () => string | null;
  thumbnail?: (preview: Blob) => Promise<string>;
  request?: typeof requestHubLink;
  checkBucket?: (viewerUrl: string) => Promise<BucketAccess>;
  notify?: (type: 'info' | 'warning', message: string) => void;
  now?: () => number;
  /** The dataset state on screen; a preview is captured only while it matches the draft's source. */
  currentSource?: () => HubSource;
}

const newSecret = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
const startCapture = (capture: HubCapture) => Promise.resolve().then(capture).catch(() => null);

/** The Hub step after an upload. Its state outlives the upload receipt; retries keep the ownership key and payload. */
export function createHubPublication(provider: HubProvider, deps: Dependencies = {}) {
  const baseUrl = deps.baseUrl ?? (() => getHubBaseUrl());
  const thumbnail = deps.thumbnail ?? makeHubThumbnail;
  const request = deps.request ?? requestHubLink;
  const checkBucket = deps.checkBucket ?? bucketAccess;
  const notify = deps.notify ?? ((type, message) => { useNotificationStore.getState().addNotification(type, message, 10_000); });
  const now = deps.now ?? Date.now;
  const currentSource = deps.currentSource ?? (() => getHubSource());
  /** Whether the dataset on screen is still the one a draft was made from, so a capture shows it. */
  const onScreen = (source: HubSource) => sameHubSource(currentSource(), source);
  let state: HubLinkState = { phase: 'idle' };
  let draft: Draft | null = null;
  let payload: HubLinkPayload | null = null;
  let dialogOpen = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const set = (next: HubLinkState) => {
    const finished = state.phase === 'creating' && (next.phase === 'ready' || next.phase === 'failed');
    state = next;
    listeners.forEach(listener => listener());
    if (finished && !dialogOpen) notify(next.phase === 'ready' ? 'info' : 'warning', next.phase === 'ready' ? READY_TOAST : FAILED_TOAST);
  };
  const busy = () => state.phase === 'checking' || state.phase === 'creating';

  const run = async (viewerUrl: string): Promise<void> => {
    const base = baseUrl();
    const current = draft;
    if (!base || !current) return;
    try {
      let access: HubAccess;
      if (current.access === 'check') {
        if (!current.bucketAccess) {
          set({ phase: 'checking', viewerUrl });
          current.bucketAccess = await checkBucket(viewerUrl);
        }
        access = current.bucketAccess === 'public' ? 'public' : 'private';
      } else access = current.access;
      set({ phase: 'creating', viewerUrl, bucketAccess: current.bucketAccess });
      if (!payload) {
        const preview = await current.preview;
        // The payload replaces the full-size preview; Retry captures a new one if building fails.
        current.preview = null;
        if (!preview) throw new HubRequestError('The upload preview is unavailable.', 'preview');
        let thumbnailBase64: string;
        try { thumbnailBase64 = await thumbnail(preview); }
        catch { throw new HubRequestError('The card preview could not be created.', 'preview'); }
        payload = buildHubPayload({ viewerUrl, metadata: current.metadata, access, thumbnailBase64, managementSecret: current.secret });
      }
      const link = await request(base, payload);
      set({ phase: 'ready', viewerUrl, bucketAccess: current.bucketAccess, url: link.url,
        managementUrl: `${link.managementUrl}#${current.secret}`, deleteLinkSeen: false });
      hubShareLinks.set(provider, { url: link.url, source: current.source, readyAt: now() });
    } catch (error) {
      const failure = error instanceof HubRequestError ? error
        : new HubRequestError(error instanceof Error && error.message ? error.message : 'ColmapView Hub could not save this link.', 'rejected');
      const retryable = RETRYABLE.has(failure.kind) && (failure.kind !== 'preview' || Boolean(current.capture));
      set({ phase: 'failed', viewerUrl, bucketAccess: current.bucketAccess, error: failure.message, retryable,
        ...(failure.retryAfterMs ? { retryAfter: now() + failure.retryAfterMs } : {}) });
      if (failure.retryAfterMs) {
        clearTimeout(retryTimer);
        const failed = state;
        retryTimer = setTimeout(() => { if (state === failed) set({ ...failed, retryAfter: undefined }); }, failure.retryAfterMs);
      }
    }
  };

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    isEnabled: () => baseUrl() !== null,
    isBusy: busy,
    /** Busy, or a link exists whose delete row has not been shown yet. */
    blocksUnload: () => busy() || (state.phase === 'ready' && !state.deleteLinkSeen),
    /**
     * Starts a draft for the next upload. The disclosure line renders exactly when the Hub is enabled
     * (hubDisclosure), so a draft always follows a shown disclosure; that is what publicAcknowledged confirms.
     */
    prepare(metadata: HubMetadata, options: HubPrepareOptions) {
      if (busy()) throw new Error('Wait for the current Hub link to finish.');
      clearTimeout(retryTimer);
      payload = null;
      hubShareLinks.set(provider, null);
      draft = baseUrl() ? {
        metadata: structuredClone(metadata), access: options.access, source: options.source, secret: newSecret(), capture: options.capture ?? null,
        preview: options.preview ? Promise.resolve(options.preview)
          : options.capture && onScreen(options.source) ? startCapture(options.capture) : null,
      } : null;
      set({ phase: 'idle' });
    },
    /** Called when the upload is verified. Later notifications for the same draft are ignored. */
    finish(viewerUrl: string, assets?: PublicationAssetSummary): Promise<void> {
      if (!draft || state.phase !== 'idle') return Promise.resolve();
      if (assets) draft.metadata.assets = structuredClone(assets);
      return run(viewerUrl);
    },
    retry(): Promise<void> {
      if (state.phase !== 'failed' || !state.retryable || state.retryAfter !== undefined || !state.viewerUrl || !draft) return Promise.resolve();
      if (!payload && !draft.preview && draft.capture) {
        // The view on screen belongs to another dataset now; its screenshot must not become this card's preview.
        if (!onScreen(draft.source)) {
          set({ ...state, error: SOURCE_CHANGED, retryable: false });
          return Promise.resolve();
        }
        draft.preview = startCapture(draft.capture);
      }
      return run(state.viewerUrl);
    },
    markDeleteLinkSeen() {
      if (state.phase !== 'ready' || state.deleteLinkSeen) return;
      state = { ...state, deleteLinkSeen: true };
      listeners.forEach(listener => listener());
    },
    setDialogOpen(open: boolean) {
      dialogOpen = open;
    },
  };
}

export const hubPublications = {
  huggingFace: createHubPublication('huggingFace'),
  googleDrive: createHubPublication('googleDrive'),
  bucket: createHubPublication('bucket'),
};
export type HubPublication = ReturnType<typeof createHubPublication>;
