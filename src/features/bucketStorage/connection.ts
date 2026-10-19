import { AwsClient } from 'aws4fetch';
import { anySignal } from '../../utils/abortSignals';
import { getStorageCorsOrigins, isPreSignedUrl } from '../../utils/urlCloudStorage';
import { bucketKeyFromUrl, bucketObjectUrl, inferBucketRootUrl, validateBucketConfig } from './paths';
import { BucketError, type BucketConfig, type BucketCredentials, type BucketSession } from './types';
import { recordStorageAccessFailure, storageAccessFailure } from '../storageAccess';
import { accountSessions, AccountSessionError } from '../accountSessions/api';

interface BucketConnectionState { config: Readonly<BucketConfig> | null; canWrite: boolean; remembered?: boolean; error?: string }
type FetchRequest = (url: string, init: RequestInit) => Promise<Response>;

/** Credentials live in this closure, never in the render snapshot, a store, or persistent storage. */
export function createBucketConnection(fetchImpl: FetchRequest = (url, init) => fetch(url, init)) {
  let state: BucketConnectionState = { config: null, canWrite: false };
  let session: BucketSession | null = null;
  let disconnectSession: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const disconnect = () => {
    const forget = state.remembered || Boolean(accountSessions.getSnapshot().bucket);
    disconnectSession?.();
    disconnectSession = null; session = null;
    state = { config: null, canWrite: false }; notify();
    if (forget) void accountSessions.disconnect('bucket').catch(() => {
      state = { ...state, error: 'Could not forget the saved bucket. Reconnect and try Disconnect again.' }; notify();
    });
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSession: () => session,
    disconnect,
    connect(input: BucketConfig, credentials?: BucketCredentials, rememberedWritable?: boolean): BucketSession {
      const config = validateBucketConfig(input);
      const remembered = rememberedWritable !== undefined;
      const accessKeyId = credentials?.accessKeyId.trim() ?? '';
      const secretAccessKey = credentials?.secretAccessKey.trim() ?? '';
      if (Boolean(accessKeyId) !== Boolean(secretAccessKey) || (credentials?.sessionToken?.trim() && !accessKeyId)) {
        throw new BucketError('Provide both the access key and secret, or leave both empty for public reads.');
      }
      if (/[\r\n]/.test(accessKeyId + secretAccessKey + (credentials?.sessionToken ?? ''))) throw new BucketError('The bucket credentials are invalid.');
      const client = accessKeyId ? new AwsClient({ accessKeyId, secretAccessKey,
        sessionToken: credentials?.sessionToken?.trim() || undefined, region: config.region, service: 's3' }) : null;
      const controller = new AbortController();
      const signatures = new Map<string, Promise<{ url: string; expiresAt: number }>>();
      const request = async (url: string, init: RequestInit = {}, cleanup = false): Promise<Response> => {
        if (bucketKeyFromUrl(config.baseUrl, url) === null) throw new BucketError('The requested file is outside the connected bucket.');
        const signal = cleanup ? init.signal ?? undefined : init.signal ? anySignal([controller.signal, init.signal]) : controller.signal;
        signal?.throwIfAborted();
        const method = (init.method ?? 'GET').toUpperCase();
        if (!(client || rememberedWritable) && !['GET', 'HEAD'].includes(method)) throw new BucketError('Connect with an access key and secret to upload.');
        const options: RequestInit = { ...init, method, signal, credentials: 'omit', redirect: client || remembered ? 'error' : 'follow',
          ...(client || remembered ? { cache: 'no-store' } : {}) };
        try {
          if (remembered && !isPreSignedUrl(url)) {
            const cacheKey = `${method}:${url}`;
            let cached = signatures.get(cacheKey);
            if (cached && (await cached).expiresAt <= Date.now() + 5000) { signatures.delete(cacheKey); cached = undefined; }
            if (!cached) {
              cached = accountSessions.signBucket(url, method, signal ?? undefined);
              signatures.set(cacheKey, cached);
              void cached.catch(() => { if (signatures.get(cacheKey) === cached) signatures.delete(cacheKey); });
              if (signatures.size > 256) signatures.delete(signatures.keys().next().value!);
            }
            const signed = await cached;
            signal?.throwIfAborted();
            const headers = new Headers(init.headers); headers.delete('Authorization');
            const response = await fetchImpl(signed.url, { ...options, headers });
            signal?.throwIfAborted();
            return response;
          }
          if (client && !isPreSignedUrl(url)) {
            const headers = new Headers(init.headers);
            headers.delete('Authorization');
            // Signing Blob uploads must never buffer the object in a JS ArrayBuffer.
            headers.set('x-amz-content-sha256', 'UNSIGNED-PAYLOAD');
            const signed = await client.sign(url, { ...options, headers });
            signal?.throwIfAborted();
            const response = await fetchImpl(signed.url, { ...options, headers: signed.headers });
            signal?.throwIfAborted();
            return response;
          }
          const response = await fetchImpl(url, options);
          signal?.throwIfAborted();
          return response;
        } catch (error) {
          signal?.throwIfAborted();
          if (error instanceof BucketError) throw error;
          if (error instanceof AccountSessionError) throw new BucketError(error.message, error.status);
          throw new BucketError(`Could not reach the bucket. Check its URL, region, and CORS policy. Whitelist these viewer origins: ${getStorageCorsOrigins().join(', ')}.`);
        }
      };
      const next: BucketSession = Object.freeze({ config, canWrite: Boolean(client) || rememberedWritable === true, signal: controller.signal, request,
        abortMultipart: async (key: string, uploadId: string, signal: AbortSignal) => {
          const url = new URL(bucketObjectUrl(config.baseUrl, key));
          url.searchParams.set('uploadId', uploadId);
          const response = await request(url.href, { method: 'DELETE', signal }, true);
          await response.body?.cancel();
          if (!response.ok && response.status !== 404) throw new BucketError('Could not clean up the unfinished multipart upload.', response.status);
        },
      });
      disconnectSession?.();
      disconnectSession = () => { controller.abort(new DOMException('Bucket disconnected', 'AbortError')); client?.cache.clear(); signatures.clear(); };
      session = next;
      state = { config, canWrite: next.canWrite, ...(remembered ? { remembered: true } : {}) }; notify();
      return next;
    },
  };
}

export const bucketConnection = createBucketConnection();
if (import.meta.hot) import.meta.hot.dispose(() => bucketConnection.disconnect());

/** Null delegates to the other provider policies. Presigned and unrelated requests remain untouched. */
export function fetchBucketDatasetRequest(url: string, init: RequestInit = {}): Promise<Response> | null {
  const session = bucketConnection.getSession();
  if (!['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase()) || isPreSignedUrl(url)) return null;
  const connected = session && bucketKeyFromUrl(session.config.baseUrl, url) !== null ? session : null;
  const bucketUrl = connected?.config.baseUrl ?? inferBucketRootUrl(url);
  if (!bucketUrl) return null;
  const denied = () => storageAccessFailure({ provider: 'bucket', bucketUrl },
    'Connect to this bucket with an access key to open the dataset. Check that the key has permission to read it.', url);
  // R2's S3 API always requires signing; an anonymous request hides its auth error behind CORS.
  if (new URL(url).hostname.endsWith('.r2.cloudflarestorage.com') && !(connected && (connected.canWrite || bucketConnection.getSnapshot().remembered))) {
    init.signal?.throwIfAborted();
    return Promise.reject(denied());
  }
  if (!connected) return null;
  return connected.request(url, init).then(response => {
    init.signal?.throwIfAborted();
    recordStorageAccessFailure(response, { provider: 'bucket', bucketUrl });
    return response;
  });
}
