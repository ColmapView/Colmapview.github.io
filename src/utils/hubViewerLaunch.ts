/** Inert startup data supplied by the Hub when it serves the viewer at a share address. */
export const HUB_VIEWER_LAUNCH_ID = 'colmapview-hub-launch';

const sharePath = /^\/(?:s\/(?:d\/[A-Za-z0-9_-]{16}|[A-Za-z]+(?:-L?[A-Za-z0-9_-]{16})?)|hub\/[A-Za-z]+(?:-L?[A-Za-z0-9_-]{16})?)\/?$/;
const viewerPath = /^\/(?:latest\/|dev\/|v\d+\.\d+\.\d+\/)?$/;

export const isHubSharePath = (path: string): boolean => sharePath.test(path);

export function readHubViewerUrl(): URL | null {
  if (typeof window === 'undefined' || !isHubSharePath(window.location.pathname)) return null;
  const node = document.getElementById(HUB_VIEWER_LAUNCH_ID);
  if (node?.tagName !== 'SCRIPT' || node.getAttribute('type') !== 'application/json') return null;
  const text = node.textContent ?? '';
  if (text.length > 262144) return null;
  try {
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1
      || !('viewerUrl' in data) || typeof data.viewerUrl !== 'string' || data.viewerUrl.length > 32768) return null;
    const url = new URL(data.viewerUrl);
    if (![window.location.origin, 'https://colmapview.opsiclear.com', 'https://colmapview.github.io'].includes(url.origin)
      || url.username || url.password || !viewerPath.test(url.pathname)
      || new URLSearchParams(url.hash.slice(1)).has('d')) return null;
    return url;
  } catch {
    return null;
  }
}

/** The share record pins the dataset; visitors may still override display flags and the saved view. */
export function getViewerStartupUrl(): URL {
  const current = new URL(window.location.href);
  const launch = readHubViewerUrl();
  if (!launch) return current;
  for (const key of ['embed', 'touch', 'splatBackend']) {
    if (current.searchParams.has(key)) launch.searchParams.set(key, current.searchParams.get(key)!);
  }
  launch.hash = current.hash || launch.hash;
  return launch;
}

export function clearHubViewerLaunch(): boolean {
  if (!readHubViewerUrl()) return false;
  document.getElementById(HUB_VIEWER_LAUNCH_ID)?.remove();
  return true;
}
