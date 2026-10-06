import { fetchHuggingFaceDatasetRequest } from '../features/huggingface/datasetAccess';
import { fetchWithTimeout, FETCH_TIMEOUT } from './fetchWithTimeout';

/** One request policy for discovery, archives, saved settings, and lazy media. */
export function fetchDatasetResource(url: string, timeout = FETCH_TIMEOUT, init: RequestInit = {}): Promise<Response> {
  return fetchWithTimeout(url, timeout, init, fetchHuggingFaceDatasetRequest);
}
