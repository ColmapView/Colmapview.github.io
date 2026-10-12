/** Published links follow the current viewer on GitHub; other hosts keep their own page. */
export function getPublicationViewerBaseUrl(location: Pick<Location, 'origin' | 'hostname' | 'pathname'>): string {
  if (location.hostname !== 'colmapview.github.io') return location.origin + location.pathname;
  return `${location.origin}/${location.pathname.startsWith('/dev/') ? 'dev' : 'latest'}/`;
}

/** Encode the complete source URL while keeping its scheme and path readable. */
export function makePublicationViewerLink(viewerBaseUrl: string, sourceUrl: string): string {
  const viewer = new URL(viewerBaseUrl);
  viewer.hash = '';
  viewer.search = new URLSearchParams({ url: sourceUrl }).toString().replace(/%3A/g, ':').replace(/%2F/g, '/');
  return viewer.href;
}
