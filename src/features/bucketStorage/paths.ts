import { BucketError, type BucketConfig } from './types';

export function normalizeBucketRoot(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new BucketError('Enter a complete bucket URL.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) {
    throw new BucketError('Use an HTTPS bucket URL without credentials or query parameters. Localhost HTTP is supported.');
  }
  url.pathname = url.pathname.replace(/\/?$/, '/');
  return url.href;
}

export function inferBucketRegion(value: string): string {
  try {
    const host = new URL(value).hostname;
    if (host.endsWith('.r2.cloudflarestorage.com')) return 'auto';
    return host.match(/(?:^|\.)s3[.-](?:dualstack\.)?([a-z]{2}(?:-gov)?-[a-z]+-\d)\./)?.[1] ?? 'us-east-1';
  } catch { return 'us-east-1'; }
}

export function validateBucketConfig(config: BucketConfig): Readonly<BucketConfig> {
  const baseUrl = normalizeBucketRoot(config.baseUrl);
  const region = config.region.trim() || inferBucketRegion(baseUrl);
  if (!/^[a-z0-9-]{1,64}$/.test(region)) throw new BucketError('Enter a valid bucket region.');
  return Object.freeze({ baseUrl, region, ...(config.publicBaseUrl?.trim() ? { publicBaseUrl: normalizeBucketRoot(config.publicBaseUrl) } : {}) });
}

export function validateBucketKey(key: string): string {
  if (new TextEncoder().encode(key).byteLength > 1024 || [...key].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || key.includes('\\')
    || key.split('/').some(part => part === '.' || part === '..')) {
    throw new BucketError('The bucket path is unsupported. Use a path under 1,024 bytes without dot segments or control characters.');
  }
  return key;
}

export function bucketObjectUrl(root: string, key: string): string {
  validateBucketKey(key);
  return root + key.split('/').map(part => encodeURIComponent(part).replace(/[!'()*]/g,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
}

/** Origin and directory boundaries constrain every authenticated request, including manifest references. */
export function bucketKeyFromUrl(root: string, value: string): string | null {
  try {
    const base = new URL(root);
    const url = new URL(value);
    if (url.username || url.password || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null;
    const key = url.pathname.slice(base.pathname.length).split('/').map(part => decodeURIComponent(part)).join('/');
    validateBucketKey(key);
    return key;
  } catch { return null; }
}

export function bucketFolder(value: string): string {
  const folder = value.trim().replace(/^\/+|\/+$/g, '');
  if (!folder) throw new BucketError('Enter a destination folder.');
  validateBucketKey(folder);
  if (new TextEncoder().encode(folder).byteLength > 512) throw new BucketError('Use a destination folder under 512 bytes.');
  return folder;
}
