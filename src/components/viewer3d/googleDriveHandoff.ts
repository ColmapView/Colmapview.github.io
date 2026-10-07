import type { ColmapManifest } from '../../types/manifest';
import { buildShareableUrl } from '../../utils/shareUrl';

/**
 * The Drive host reopens a remote dataset from the same `#d=` payload a share link uses: it covers URL and
 * inline-manifest sources, and a fragment never reaches the host's server logs. Local files cannot travel.
 */
export function getGoogleDriveHandoffUrl(origin: string, source: string | ColmapManifest | null): string {
  if (!source) return origin;
  return buildShareableUrl({ baseUrl: new URL('/', origin).href, manifestUrlOrManifest: source, viewState: null, config: null });
}
