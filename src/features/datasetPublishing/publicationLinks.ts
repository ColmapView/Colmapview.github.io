import { isHubSharePath } from '../../utils/hubViewerLaunch';

/** Published links follow the viewer release, never a previous dataset's short address. */
export function getPublicationViewerBaseUrl(location: Pick<Location, 'origin' | 'hostname' | 'pathname'>): string {
  if (isHubSharePath(location.pathname)) return location.origin + '/';
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
