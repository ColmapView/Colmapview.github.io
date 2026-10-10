import { fetchHuggingFaceDatasetRequest } from '../features/huggingface/datasetAccess';
import { fetchBucketDatasetRequest } from '../features/bucketStorage/connection';
import { fetchWithTimeout, FETCH_TIMEOUT } from './fetchWithTimeout';

/** One request policy for discovery, archives, saved settings, and lazy media. */
export function fetchDatasetResource(url: string, timeout = FETCH_TIMEOUT, init: RequestInit = {}): Promise<Response> {
  return fetchWithTimeout(url, timeout, init, fetchDatasetRequest);
}

/** Provider access without a transfer timeout; callers can own the inactivity policy. */
export function fetchDatasetRequest(url: string, init: RequestInit = {}): Promise<Response> {
  return fetchBucketDatasetRequest(url, init) ?? fetchHuggingFaceDatasetRequest(url, init);
}
