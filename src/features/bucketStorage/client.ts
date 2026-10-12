import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { readBoundedResponse } from '../../utils/publishedViewerState';
import { bucketObjectUrl, validateBucketKey } from './paths';
import { BucketError, type BucketPage, type BucketSession } from './types';

export async function bucketXml(response: Response, expectedRoot: string, bucketUrl?: string): Promise<Element> {
  await assertBucketResponse(response, bucketUrl);
  const text = await (await readBoundedResponse(response, 8 * 1024 * 1024,
    () => new BucketError('The bucket returned an oversized metadata response.'))).text();
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== expectedRoot) {
    throw new BucketError('The bucket returned an invalid metadata response.');
  }
  return document.documentElement;
}

export function xmlValue(element: Element, name: string): string {
  return [...element.children].find(child => child.localName === name)?.textContent ?? '';
}

export async function assertBucketResponse(response: Response, bucketUrl?: string): Promise<void> {
  if (response.ok) return;
  await response.body?.cancel().catch(() => {});
  if (response.status === 401 || response.status === 403) throw new BucketError('Bucket access was denied. Check the credentials and permissions, or open a public object URL.',
    response.status, bucketUrl ? { provider: 'bucket', bucketUrl } : undefined);
  if (response.status === 404) throw new BucketError('The bucket or object was not found.', 404);
  throw new BucketError(`Bucket request failed (HTTP ${response.status}). Try again.`, response.status);
}

export function bucketRequest(session: BucketSession, url: string, init: RequestInit = {}): Promise<Response> {
  return fetchWithTimeout(url, 120_000, init, session.request);
}

export async function listBucketPage(session: BucketSession, prefix: string, signal: AbortSignal,
  options: { token?: string; recursive?: boolean } = {}): Promise<BucketPage> {
  validateBucketKey(prefix);
  const url = new URL(session.config.baseUrl);
  url.searchParams.set('list-type', '2');
  url.searchParams.set('prefix', prefix);
  url.searchParams.set('max-keys', '1000');
  url.searchParams.set('encoding-type', 'url');
  if (!options.recursive) url.searchParams.set('delimiter', '/');
  if (options.token) url.searchParams.set('continuation-token', options.token);
  const root = await bucketXml(await bucketRequest(session, url.href, { signal }), 'ListBucketResult', session.config.baseUrl);
  const decode = (value: string) => {
    let key: string;
    try { key = decodeURIComponent(value); } catch { throw new BucketError('The bucket returned an invalid object path.'); }
    validateBucketKey(key);
    if (!key.startsWith(prefix)) throw new BucketError('The bucket listing escaped the selected folder.');
    return key;
  };
  const encoded = xmlValue(root, 'EncodingType') === 'url';
  const path = (value: string) => encoded ? decode(value) : decode(encodeURIComponent(value));
  const objects = [...root.children].filter(child => child.localName === 'Contents').map(child => {
    const rawSize = xmlValue(child, 'Size');
    const size = /^\d+$/.test(rawSize) ? Number(rawSize) : NaN;
    if (!Number.isSafeInteger(size) || size < 0) throw new BucketError('The bucket returned an invalid object size.');
    return { key: path(xmlValue(child, 'Key')), size };
  });
  const directories = [...root.children].filter(child => child.localName === 'CommonPrefixes').map(child => path(xmlValue(child, 'Prefix')));
  const nextToken = xmlValue(root, 'NextContinuationToken') || null;
  if (xmlValue(root, 'IsTruncated') === 'true' && !nextToken) throw new BucketError('The bucket listing is incomplete. Try a narrower folder.');
  if (nextToken && nextToken === options.token) throw new BucketError('The bucket repeated a listing page. Try a narrower folder.');
  signal.throwIfAborted();
  return { objects, directories, nextToken: xmlValue(root, 'IsTruncated') === 'true' ? nextToken : null };
}

export function bucketKeyUrl(session: BucketSession, key: string): string { return bucketObjectUrl(session.config.baseUrl, key); }
