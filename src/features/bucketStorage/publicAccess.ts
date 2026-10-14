import { ColmapManifestSchema } from '../../types/manifest';
import { timeoutSignal } from '../../utils/abortSignals';
import { readBoundedResponse } from '../../utils/publishedViewerState';

export type BucketAccess = 'public' | 'private' | 'unknown';

const LOCAL_SUFFIXES = ['.local', '.internal', '.lan', '.home.arpa', '.localhost'];

/** Hosts nobody elsewhere can reach: loopback, private and link-local ranges, local names, and single-label names. */
export function isInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host === 'home.arpa' || LOCAL_SUFFIXES.some(suffix => host.endsWith(suffix))) return true;
  // An IPv4-mapped IPv6 address is judged as its IPv4 address; URLs rewrite ::ffff:127.0.0.1 as ::ffff:7f00:1.
  const mapped = /^::ffff:(?:(\d{1,3}(?:\.\d{1,3}){3})|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(host);
  if (mapped) {
    if (mapped[1]) return isInternalHost(mapped[1]);
    const [high, low] = [Number.parseInt(mapped[2], 16), Number.parseInt(mapped[3], 16)];
    return isInternalHost([high >> 8, high & 255, low >> 8, low & 255].join('.'));
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (host.includes(':')) return host === '::1' || host === '::' || /^f[cd][0-9a-f]{0,2}:/.test(host) || /^fe[89ab][0-9a-f]?:/.test(host);
  return !host.includes('.');
}

const refused = (response: Response) => response.status === 401 || response.status === 403
  || Boolean(response.headers.get('Content-Type')?.includes('text/html'));

/**
 * Whether a recipient without the bucket session, signatures or cookies can open the upload.
 * Refusals and sign-in pages mean private; anything inconclusive (CORS, network, other errors) means unknown.
 */
export async function bucketAccess(viewerUrl: string): Promise<BucketAccess> {
  try {
    const source = new URL(new URL(viewerUrl).searchParams.get('url') ?? '');
    if (isInternalHost(source.hostname)) return 'private';
    return await probe(source.href);
  } catch { return 'unknown'; }
}

async function probe(source: string): Promise<BucketAccess> {
  const signal = timeoutSignal(10000);
  const request = (url: string, headers?: HeadersInit) => fetch(url, { credentials: 'omit', signal, headers });
  const sample = async (url: string, zip = false): Promise<BucketAccess> => {
    const response = await request(url, { Range: 'bytes=0-3' });
    const reader = response.body?.getReader();
    try {
      if (refused(response)) return 'private';
      if (!response.ok || !reader) return 'unknown';
      const header = new Uint8Array(4);
      let length = 0;
      while (length < header.length) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!zip && value.length) return 'public';
        const bytes = value.subarray(0, header.length - length);
        header.set(bytes, length);
        length += bytes.length;
      }
      return zip && length === 4 && header[0] === 0x50 && header[1] === 0x4b && header[2] === 3 && header[3] === 4 ? 'public' : 'unknown';
    } finally { if (reader) { await reader.cancel(); reader.releaseLock(); } }
  };
  if (new URL(source).pathname.toLowerCase().endsWith('.zip')) return sample(source, true);
  const response = await request(source);
  if (refused(response)) { await response.body?.cancel(); return 'private'; }
  const manifest = ColmapManifestSchema.parse(JSON.parse(await (await readBoundedResponse(response, 8 * 1024 * 1024)).text()));
  const files = [...Object.values(manifest.files), manifest.viewerStatePath, manifest.splats?.[0],
    Object.values(manifest.imageNameToPath ?? {})[0] ?? manifest.images?.[0]].filter((file): file is string => Boolean(file));
  const results = await Promise.all(files.map(file => sample(new URL(file, manifest.baseUrl).href)));
  return results.includes('private') ? 'private' : results.every(result => result === 'public') ? 'public' : 'unknown';
}
