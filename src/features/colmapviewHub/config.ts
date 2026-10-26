const PRODUCTION_HUB = 'https://colmapview.opsiclear.com/hub';
const HUB_HOSTS = new Set(['colmapview.opsiclear.com', 'colmapview.github.io']);

/** Browse the gallery on the same production host; backend writes stay on Cloudflare. */
export function getHubCatalogUrl(location: Pick<Location, 'origin'> = window.location): string {
  return location.origin === 'https://colmapview.github.io'
    ? location.origin + '/hub/datasets/' : PRODUCTION_HUB + '/datasets/';
}

/**
 * Where this viewer creates Hub links: VITE_HUB_BASE_URL when set (development and e2e), otherwise
 * the production Hub on the two production hosts. Anywhere else the Hub is off: no disclosure, no request, no Hub UI.
 */
export function getHubBaseUrl(env: { VITE_HUB_BASE_URL?: string } = import.meta.env,
  location: Pick<Location, 'protocol' | 'hostname'> = window.location): string | null {
  const configured = env.VITE_HUB_BASE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      // A literal ? or # in the serialized URL means a query or fragment, even an empty one that search and hash report as ''.
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[?#]/.test(url.href)) return null;
      return url.href.replace(/\/+$/, '');
    } catch { return null; }
  }
  return location.protocol === 'https:' && HUB_HOSTS.has(location.hostname) ? PRODUCTION_HUB : null;
}
