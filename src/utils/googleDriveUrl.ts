import { getGoogleDrivePickerConfig } from '../features/googleDrive/picker';

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
  // Multi-account links add /u/<n>/ ("/u/0/uc?id=…", "/file/u/0/d/<id>/view"); it picks a signed-in account, not a file.
  const path = url.pathname.replace(/^\/u\/\d+(?=\/)/, '').replace(/^\/file\/u\/\d+\/d\//, '/file/d/');
  const pathId = /^\/file\/d\/([A-Za-z0-9_-]+)(?:\/(?:view|preview|edit))?\/?$/.exec(path)?.[1];
  const queryIds = url.searchParams.getAll('id');
  const queryId = ['/', '/open', '/uc'].includes(path) && queryIds.length === 1 ? queryIds[0] : undefined;
  const fileId = pathId ?? queryId;
  const keys = url.searchParams.getAll('resourcekey');
  if (!fileId || !/^[A-Za-z0-9_-]{1,200}$/.test(fileId) || queryIds.length > 1
    || (pathId && queryIds.length && queryIds[0] !== pathId)
    || keys.length > 1 || (keys.length && !/^[A-Za-z0-9_-]{1,200}$/.test(keys[0]))) {
    throw new Error(/\/folders\//.test(path)
      // Only some viewers have the picker; GitHub Pages has no Drive at all.
      ? `Paste a Google Drive file link to a ZIP or TAR archive rather than a folder link.${getGoogleDrivePickerConfig() ? ' For a private archive, use the Google Drive picker.' : ''}`
      : 'Paste a Google Drive file sharing link to a ZIP or TAR archive, such as https://drive.google.com/file/d/FILE_ID/view.');
  }
  const source = new URL(`https://drive.google.com/file/d/${fileId}/view`);
  if (keys[0]) source.searchParams.set('resourcekey', keys[0]);
  return { fileId, resourceKey: keys[0], sourceUrl: source.href };
}
