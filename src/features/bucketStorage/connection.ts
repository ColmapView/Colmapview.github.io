import { AwsClient } from 'aws4fetch';
import { anySignal } from '../../utils/abortSignals';
import { isPreSignedUrl } from '../../utils/urlCloudStorage';
import { bucketKeyFromUrl, bucketObjectUrl, validateBucketConfig } from './paths';
import { BucketError, type BucketConfig, type BucketCredentials, type BucketSession } from './types';

interface BucketConnectionState { config: Readonly<BucketConfig> | null; canWrite: boolean }
type FetchRequest = (url: string, init: RequestInit) => Promise<Response>;

/** Credentials live in this closure, never in the render snapshot, a store, or persistent storage. */
export function createBucketConnection(fetchImpl: FetchRequest = (url, init) => fetch(url, init)) {
  let state: BucketConnectionState = { config: null, canWrite: false };
  let session: BucketSession | null = null;
  let disconnectSession: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const disconnect = () => {
    disconnectSession?.();
    disconnectSession = null; session = null;
    state = { config: null, canWrite: false }; notify();
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSession: () => session,
    disconnect,
    connect(input: BucketConfig, credentials?: BucketCredentials): BucketSession {
      const config = validateBucketConfig(input);
      const accessKeyId = credentials?.accessKeyId.trim() ?? '';
      const secretAccessKey = credentials?.secretAccessKey.trim() ?? '';
      if (Boolean(accessKeyId) !== Boolean(secretAccessKey) || (credentials?.sessionToken?.trim() && !accessKeyId)) {
        throw new BucketError('Provide both the access key and secret, or leave both empty for public reads.');
      }
      if (/[\r\n]/.test(accessKeyId + secretAccessKey + (credentials?.sessionToken ?? ''))) throw new BucketError('The bucket credentials are invalid.');
      const client = accessKeyId ? new AwsClient({ accessKeyId, secretAccessKey,
        sessionToken: credentials?.sessionToken?.trim() || undefined, region: config.region, service: 's3' }) : null;
      const controller = new AbortController();
      const request = async (url: string, init: RequestInit = {}, cleanup = false): Promise<Response> => {
        if (bucketKeyFromUrl(config.baseUrl, url) === null) throw new BucketError('The requested file is outside the connected bucket.');
        const signal = cleanup ? init.signal ?? undefined : init.signal ? anySignal([controller.signal, init.signal]) : controller.signal;
        signal?.throwIfAborted();
        const method = (init.method ?? 'GET').toUpperCase();
        if (!client && !['GET', 'HEAD'].includes(method)) throw new BucketError('Connect with an access key and secret to upload.');
        const options: RequestInit = { ...init, method, signal, credentials: 'omit', redirect: client ? 'error' : 'follow',
          ...(client ? { cache: 'no-store' } : {}) };
        try {
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
          throw new BucketError('Could not reach the bucket. Check its URL, region, and CORS policy for this viewer.');
        }
      };
      const next: BucketSession = Object.freeze({ config, canWrite: Boolean(client), signal: controller.signal, request,
        abortMultipart: async (key: string, uploadId: string, signal: AbortSignal) => {
          const url = new URL(bucketObjectUrl(config.baseUrl, key));
          url.searchParams.set('uploadId', uploadId);
          const response = await request(url.href, { method: 'DELETE', signal }, true);
          await response.body?.cancel();
          if (!response.ok && response.status !== 404) throw new BucketError('Could not clean up the unfinished multipart upload.', response.status);
        },
      });
      disconnectSession?.();
      disconnectSession = () => { controller.abort(new DOMException('Bucket disconnected', 'AbortError')); client?.cache.clear(); };
      session = next;
      state = { config, canWrite: next.canWrite }; notify();
      return next;
    },
  };
}

export const bucketConnection = createBucketConnection();
if (import.meta.hot) import.meta.hot.dispose(() => bucketConnection.disconnect());

/** Null delegates to the other provider policies. Presigned and unrelated requests remain untouched. */
export function fetchBucketDatasetRequest(url: string, init: RequestInit = {}): Promise<Response> | null {
  const session = bucketConnection.getSession();
  if (!session || !['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase()) || isPreSignedUrl(url)
    || bucketKeyFromUrl(session.config.baseUrl, url) === null) return null;
  return session.request(url, init);
}
