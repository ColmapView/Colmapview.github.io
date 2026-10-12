import type { StorageAccessRequest, UrlLoadError } from '../types/manifest';
import { getHfAccountConfiguration } from './huggingface/config';
import { getGoogleDrivePickerConfig } from './googleDrive/config';
import { inferBucketRootUrl } from './bucketStorage/paths';
import { isPreSignedUrl } from '../utils/urlCloudStorage';

// Optional masks may answer 403 when absent. The request records access context;
// required manifest/model/archive reads decide whether the failure needs a dialog.
const responseAccess = new WeakMap<Response, StorageAccessRequest>();

export function recordStorageAccessFailure(response: Response, access: StorageAccessRequest): void {
  if (response.status === 401 || response.status === 403) responseAccess.set(response, access);
}

export function assertStorageReadAccess(response: Response, url: string): void {
  if (![401, 403].includes(response.status) || isPreSignedUrl(url)) return;
  const bucketUrl = inferBucketRootUrl(url);
  const access = responseAccess.get(response) ?? (bucketUrl ? { provider: 'bucket' as const, bucketUrl } : undefined);
  if (!access) return;
  void response.body?.cancel().catch(() => {});
  throw storageAccessFailure(access, 'Connect to this bucket with a key that permits reading the dataset, then retry.', url);
}

/** Provider-owned access failures survive manifest and archive error classification. */
export function getStorageAccessRequest(error: unknown): StorageAccessRequest | undefined {
  if (!error || typeof error !== 'object' || !('access' in error)) return;
  const access = error.access;
  if (!access || typeof access !== 'object' || !('provider' in access)) return;
  if (access.provider === 'hf' || access.provider === 'google') return { provider: access.provider };
  if (access.provider === 'bucket' && 'bucketUrl' in access && typeof access.bucketUrl === 'string') {
    return { provider: 'bucket', bucketUrl: access.bucketUrl };
  }
}

export function canRecoverStorageAccess(access: StorageAccessRequest): boolean {
  if (access.provider === 'bucket') return true;
  if (access.provider === 'hf') return getHfAccountConfiguration().status === 'ready';
  return Boolean(getGoogleDrivePickerConfig());
}

export function storageAccessFailure(access: StorageAccessRequest, message: string, url?: string): UrlLoadError {
  return { type: 'auth', access, message, failedFile: url };
}
