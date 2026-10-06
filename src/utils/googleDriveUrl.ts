export interface GoogleDriveFileReference {
  fileId: string;
  resourceKey?: string;
  sourceUrl: string;
}

/** Only file links on Drive's own HTTPS origin are treated as Drive imports. */
export function parseGoogleDriveFileUrl(value: string): GoogleDriveFileReference | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.hostname !== 'drive.google.com') return null;
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Use an HTTPS Google Drive file sharing link.');
  }
  const pathId = /^\/file\/d\/([A-Za-z0-9_-]+)(?:\/(?:view|preview|edit))?\/?$/.exec(url.pathname)?.[1];
  const queryIds = url.searchParams.getAll('id');
  const queryId = ['/', '/open', '/uc'].includes(url.pathname) && queryIds.length === 1 ? queryIds[0] : undefined;
  const fileId = pathId ?? queryId;
  const keys = url.searchParams.getAll('resourcekey');
  if (!fileId || !/^[A-Za-z0-9_-]{1,200}$/.test(fileId) || queryIds.length > 1
    || (pathId && queryIds.length && queryIds[0] !== pathId)
    || keys.length > 1 || (keys.length && !/^[A-Za-z0-9_-]{1,200}$/.test(keys[0]))) {
    throw new Error('Paste a Google Drive file link to a ZIP or TAR archive rather than a folder link. For a private archive, use the Google Drive picker.');
  }
  const source = new URL(`https://drive.google.com/file/d/${fileId}/view`);
  if (keys[0]) source.searchParams.set('resourcekey', keys[0]);
  return { fileId, resourceKey: keys[0], sourceUrl: source.href };
}
