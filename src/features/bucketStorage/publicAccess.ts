import { ColmapManifestSchema } from '../../types/manifest';
import { timeoutSignal } from '../../utils/abortSignals';
import { readBoundedResponse } from '../../utils/publishedViewerState';

/** Check the recipient path without the bucket session, signatures, or browser cookies. */
export async function isPublishedBucketPublic(viewerUrl: string): Promise<boolean> {
  try {
    const source = new URL(viewerUrl).searchParams.get('url');
    if (!source) return false;
    const signal = timeoutSignal(10000);
    const request = (url: string, headers?: HeadersInit) => fetch(url, { credentials: 'omit', signal, headers });
    const sample = async (url: string, zip = false): Promise<boolean> => {
      const response = await request(url, { Range: 'bytes=0-3' });
      const reader = response.body?.getReader();
      try {
        if (!response.ok || !reader || response.headers.get('Content-Type')?.includes('text/html')) return false;
        const header = new Uint8Array(4);
        let length = 0;
        while (length < header.length) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!zip && value.length) return true;
          const bytes = value.subarray(0, header.length - length);
          header.set(bytes, length);
          length += bytes.length;
        }
        return zip && length === 4 && header[0] === 0x50 && header[1] === 0x4b && header[2] === 3 && header[3] === 4;
      } finally { if (reader) { await reader.cancel(); reader.releaseLock(); } }
    };
    if (new URL(source).pathname.toLowerCase().endsWith('.zip')) return await sample(source, true);
    const manifest = ColmapManifestSchema.parse(JSON.parse(await (await readBoundedResponse(await request(source), 8 * 1024 * 1024)).text()));
    const files = [...Object.values(manifest.files), manifest.viewerStatePath, manifest.splats?.[0],
      Object.values(manifest.imageNameToPath ?? {})[0] ?? manifest.images?.[0]].filter((file): file is string => Boolean(file));
    return (await Promise.all(files.map(file => sample(new URL(file, manifest.baseUrl).href)))).every(Boolean);
  } catch { return false; }
}
