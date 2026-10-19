import { parseGoogleDriveFileUrl, type GoogleDriveFileReference } from '../../utils/googleDriveUrl';
import { GOOGLE_DRIVE_ENABLED_ORIGIN } from './config';

export interface GoogleDriveOpenFile extends GoogleDriveFileReference {
  /** An account-selection hint from Drive, never proof of authorization. */
  userId?: string;
}

export type GoogleDriveOpenWithRequest =
  | { kind: 'none' }
  | { kind: 'open'; file: GoogleDriveOpenFile }
  | { kind: 'error'; message: string };

export function isGoogleDriveOpenWithSearch(search: string): boolean {
  return new URLSearchParams(search).getAll('drive').includes('open');
}

/** Drive supplies untrusted JSON in an already URL-decoded query parameter. */
export function parseGoogleDriveOpenWith(search: string): GoogleDriveOpenWithRequest {
  if (!isGoogleDriveOpenWithSearch(search)) return { kind: 'none' };
  const invalid = { kind: 'error', message: 'This Google Drive launch link is invalid. Open a ZIP or TAR archive in Drive and choose Open with → ColmapView again.' } as const;
  const params = new URLSearchParams(search);
  const states = params.getAll('state');
  if (params.getAll('drive').length !== 1 || states.length !== 1 || states[0].length > 16_384) return invalid;
  try {
    const state: unknown = JSON.parse(states[0]);
    if (!state || typeof state !== 'object' || Array.isArray(state)) return invalid;
    const { action, ids, resourceKeys, userId } = state as Record<string, unknown>;
    if (action !== 'open' || !Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string')) return invalid;
    if (ids.length !== 1) return { kind: 'error', message: 'Open one dataset archive at a time. Select a single ZIP or TAR file in Google Drive.' };
    if (userId !== undefined && (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(userId))) return invalid;
    if (resourceKeys !== undefined && (!resourceKeys || typeof resourceKeys !== 'object' || Array.isArray(resourceKeys))) return invalid;
    const source = new URL(`https://drive.google.com/file/d/${encodeURIComponent(ids[0])}/view`);
    if (resourceKeys && Object.hasOwn(resourceKeys, ids[0])) {
      const key = (resourceKeys as Record<string, unknown>)[ids[0]];
      if (typeof key !== 'string') return invalid;
      source.searchParams.set('resourcekey', key);
    }
    const file = parseGoogleDriveFileUrl(source.href);
    if (!file || file.fileId !== ids[0]) return invalid;
    return { kind: 'open', file: { ...file, userId: userId as string | undefined } };
  } catch { return invalid; }
}

/** Only the selected file and account hint can cross the fixed host boundary. */
export function googleDriveOpenWithHandoff(file: GoogleDriveOpenFile): string {
  const target = new URL(GOOGLE_DRIVE_ENABLED_ORIGIN);
  target.searchParams.set('drive', 'open');
  target.searchParams.set('state', JSON.stringify({
    action: 'open', ids: [file.fileId],
    ...(file.resourceKey ? { resourceKeys: { [file.fileId]: file.resourceKey } } : {}),
    ...(file.userId ? { userId: file.userId } : {}),
  }));
  return target.href;
}

/** Remove raw launch JSON and the account hint from this tab's history entry. */
export function googleDriveOpenWithViewerUrl(currentUrl: string, request: GoogleDriveOpenWithRequest): string {
  const url = new URL(currentUrl);
  for (const name of ['drive', 'state', 'url']) url.searchParams.delete(name);
  url.hash = '';
  if (request.kind === 'open') url.searchParams.set('url', request.file.sourceUrl);
  return url.href;
}
