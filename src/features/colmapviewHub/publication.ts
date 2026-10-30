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
export interface PublicHubDataset {
  viewerUrl: string;
  metadata: HubMetadata;
  thumbnailBase64: string;
  source: HubSource;
}
export type HubFailureKind = 'network' | 'timeout' | 'rate-limited' | 'unavailable' | 'rejected' | 'preview';
export interface HubLinkState {
  phase: 'idle' | 'checking' | 'creating' | 'ready' | 'failed';
  viewerUrl?: string;
  bucketAccess?: BucketAccess;
  url?: string;
  error?: string;
  retryable?: boolean;
  /** Set until a 429's Retry-After passes; the controller clears it then. */
  coolingDown?: true;
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
const READY_TOAST = 'Hub link ready. Reopen the upload dialog to copy it.';
const FAILED_TOAST = 'Hub link not created. Reopen the upload dialog to retry.';
const INVALID_LINK = 'Spatial Hub returned an invalid link.';
const SOURCE_CHANGED = "The dataset changed, so its preview can't be captured. Upload again to create a Hub link.";

/** A failure to reach the Hub or to receive its answer: a timeout, or a network error. */
function transportError(error: unknown): HubRequestError {
  const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
  return timedOut ? new HubRequestError("Spatial Hub didn't respond.", 'timeout') : new HubRequestError("Couldn't reach Spatial Hub.", 'network');
}

/** POST /api/links with typed failures. Management stays under the configured Hub; short shares use its origin. */
export async function requestHubLink(baseUrl: string, payload: HubLinkPayload): Promise<{ url: string; managementUrl: string }> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/links`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
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
  if (response.status >= 500) throw new HubRequestError('Spatial Hub is unavailable.', 'unavailable');
  if (bodyError !== undefined) throw transportError(bodyError);
  if (!response.ok) {
    const message = field('error');
    throw new HubRequestError(typeof message === 'string' && message ? message : 'Spatial Hub rejected this link.', 'rejected');
  }
  const [url, managementPath] = [field('url'), field('managementPath')];
  if (typeof url !== 'string' || typeof managementPath !== 'string') throw new HubRequestError(INVALID_LINK, 'rejected');
  const root = `${baseUrl}/`;
  let link: URL;
  let management: URL;
  try { link = new URL(url); management = new URL(managementPath, root); }
  catch { throw new HubRequestError(INVALID_LINK, 'rejected'); }
  if (!link.href.startsWith(root) || !management.href.startsWith(`${root}manage/`)) throw new HubRequestError(INVALID_LINK, 'rejected');
  const shareUrl = field('shareUrl');
  if (shareUrl !== undefined) {
    const name = link.pathname.slice(new URL(root).pathname.length);
    if (typeof shareUrl !== 'string' || !name || name.includes('/') || link.search || link.hash) throw new HubRequestError(INVALID_LINK, 'rejected');
    let share: URL;
    try { share = new URL(shareUrl); } catch { throw new HubRequestError(INVALID_LINK, 'rejected'); }
    // The additive address must identify the same record on the same Hub origin, without extra state.
    if (share.href !== new URL(`/s/${name}`, root).href) throw new HubRequestError(INVALID_LINK, 'rejected');
    link = share;
  }
  return { url: link.href, managementUrl: management.href };
}

interface Draft {
  metadata: HubMetadata;
  access: HubAccess | 'check';
  source: HubSource;
  secret: string;
  capture: HubCapture | null;
  /** The card image, started with the upload; rejects with a 'preview' HubRequestError. */
  thumbnail: Promise<string> | null;
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
  /** The card image from a preview, started now so it is ready when the upload is. */
  const cardThumbnail = (preview: Promise<Blob | null>): Promise<string> => {
    const card = preview.then(async blob => {
      if (!blob) throw new HubRequestError('The upload preview is unavailable.', 'preview');
      try { return await thumbnail(blob); }
      catch { throw new HubRequestError('The card preview could not be created.', 'preview'); }
    });
    // run() reports a failure once it awaits the card; until then the rejection is expected.
    card.catch(() => {});
    return card;
  };
  let state: HubLinkState = { phase: 'idle' };
  let draft: Draft | null = null;
  /** A draft prepared for an upload that has not started yet; `draft: null` when the Hub is off. */
  let staged: { draft: Draft | null } | null = null;
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
    const hubUrl = baseUrl();
    const current = draft;
    if (!hubUrl || !current) return;
    try {
      if (current.access === 'check' && !current.bucketAccess) {
        // The card image has been building since the upload started, so it runs alongside the check.
        set({ phase: 'checking', viewerUrl });
        current.bucketAccess = await checkBucket(viewerUrl);
      }
      const base = { viewerUrl, bucketAccess: current.bucketAccess };
      const access: HubAccess = current.access !== 'check' ? current.access : current.bucketAccess === 'public' ? 'public' : 'private';
      set({ phase: 'creating', ...base });
      if (!payload) {
        const card = current.thumbnail;
        // The payload replaces the card image; Retry captures a new one if building fails.
        current.thumbnail = null;
        if (!card) throw new HubRequestError('The upload preview is unavailable.', 'preview');
        payload = buildHubPayload({ viewerUrl, metadata: current.metadata, access, thumbnailBase64: await card, managementSecret: current.secret });
      }
      const link = await request(hubUrl, payload);
      set({ phase: 'ready', ...base, url: link.url });
      hubShareLinks.set(provider, { url: link.url, source: current.source, readyAt: now() });
    } catch (error) {
      const failure = error instanceof HubRequestError ? error
        : new HubRequestError(error instanceof Error && error.message ? error.message : 'Spatial Hub could not save this link.', 'rejected');
      const retryable = RETRYABLE.has(failure.kind) && (failure.kind !== 'preview' || Boolean(current.capture));
      set({ phase: 'failed', viewerUrl, bucketAccess: current.bucketAccess, error: failure.message, retryable,
        ...(failure.retryAfterMs ? { coolingDown: true } : {}) });
      if (failure.retryAfterMs) {
        clearTimeout(retryTimer);
        const failed = state;
        retryTimer = setTimeout(() => { if (state === failed) set({ ...failed, coolingDown: undefined }); }, failure.retryAfterMs);
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
    blocksUnload: busy,
    /** Verified public uploads can be explicitly listed without uploading their files again. */
    getPublicDataset(): PublicHubDataset | null {
      if (!payload || !draft || draft.access === 'private' || draft.access === 'check' && draft.bucketAccess !== 'public') return null;
      return { viewerUrl: payload.viewerUrl, metadata: { title: payload.title, description: payload.description,
        ...(payload.license ? { license: structuredClone(payload.license) } : {}), ...(payload.assets ? { assets: structuredClone(payload.assets) } : {}) },
        thumbnailBase64: payload.thumbnailBase64, source: draft.source };
    },
    /**
     * Stages a draft for the upload that `start` begins, then runs `start`. The draft replaces the current
     * link and share link only once that upload starts (commit, which bindHubPublication calls), so an upload
     * its controller refuses leaves both as they were. The disclosure line renders exactly when the Hub is
     * enabled (hubDisclosure), so a draft always follows a shown disclosure; that is what publicAcknowledged confirms.
     */
    prepare(metadata: HubMetadata, options: HubPrepareOptions, start: () => Promise<void>): Promise<void> {
      if (busy()) throw new Error('Wait for the current Hub link to finish.');
      const preview = !baseUrl() ? null : options.preview ? Promise.resolve(options.preview)
        : options.capture && onScreen(options.source) ? startCapture(options.capture) : null;
      staged = { draft: baseUrl() ? {
        metadata: structuredClone(metadata), access: options.access, source: options.source, secret: newSecret(),
        capture: options.capture ?? null, thumbnail: preview && cardThumbnail(preview),
      } : null };
      // Upload controllers start synchronously, so a draft still staged afterwards belongs to a refused upload.
      try { return start(); } finally { staged = null; }
    },
    /** Replaces the current link with the staged draft. Called when the upload actually starts; a no-op otherwise. */
    commit() {
      if (!staged) return;
      clearTimeout(retryTimer);
      payload = null;
      hubShareLinks.set(provider, null);
      draft = staged.draft;
      staged = null;
      set({ phase: 'idle' });
    },
    /** Called when the upload is verified. Later notifications for the same draft are ignored. */
    finish(viewerUrl: string, assets?: PublicationAssetSummary): Promise<void> {
      if (!draft || state.phase !== 'idle') return Promise.resolve();
      if (assets) draft.metadata.assets = structuredClone(assets);
      return run(viewerUrl);
    },
    retry(): Promise<void> {
      if (state.phase !== 'failed' || !state.retryable || state.coolingDown || !state.viewerUrl || !draft) return Promise.resolve();
      if (!payload && !draft.thumbnail && draft.capture) {
        // The view on screen belongs to another dataset now; its screenshot must not become this card's preview.
        if (!onScreen(draft.source)) {
          set({ ...state, error: SOURCE_CHANGED, retryable: false });
          return Promise.resolve();
        }
        draft.thumbnail = cardThumbnail(startCapture(draft.capture));
      }
      return run(state.viewerUrl);
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
