import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { readBoundedResponse } from '../../utils/publishedViewerState';
import { createTransferTimeout } from '../huggingface/transferTimeout';
import { assertGoogleDriveHostAllowed, getGoogleDriveConfiguration } from './config';

export class GoogleDrivePublishError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) { super(message); this.name = 'GoogleDrivePublishError'; this.status = status; }
}
function assertDrivePublishingAllowed(): void {
  try { assertGoogleDriveHostAllowed(); }
  catch (error) { throw new GoogleDrivePublishError((error as Error).message); }
  if (import.meta.env.PROD && !getGoogleDriveConfiguration().clientId) {
    throw new GoogleDrivePublishError('Google Drive publishing is not configured for this viewer.');
  }
}
export const DRIVE_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
const ROOT = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FIELDS = 'id,name,size,mimeType,md5Checksum,appProperties,trashed,resourceKey,permissions(type,role,allowFileDiscovery)';
export const DRIVE_OPERATION_KEY = 'colmapviewOperation';
export interface DrivePublishedFile {
  id: string; name: string; size: string; mimeType: string; trashed?: boolean;
  md5Checksum?: string;
  appProperties?: Record<string, string>; resourceKey?: string;
  permissions?: Array<{ type: string; role: string; allowFileDiscovery?: boolean }>;
}
export type DriveUploadRequest = (url: string, init: RequestInit, progress?: (bytes: number) => void) => Promise<Response>;

export function validateDriveFileId(id: string): string {
  if (!/^[A-Za-z0-9_-]{6,256}$/.test(id)) throw new GoogleDrivePublishError('Google Drive returned an invalid file ID.');
  return id;
}
export function validateDriveUploadUrl(value: string): string {
  const url = new URL(value);
  if (url.origin !== 'https://www.googleapis.com' || url.username || url.password || url.hash
    || !/^\/upload\/drive\/v3\/files(?:\/[A-Za-z0-9_-]+)?$/.test(url.pathname)
    || !url.searchParams.get('upload_id')) throw new GoogleDrivePublishError('Google Drive returned an unexpected upload address.');
  return url.href;
}

/** XHR reports upload activity, so a slow moving transfer does not hit a fixed deadline. */
export const uploadDriveChunk: DriveUploadRequest = async (url, init, progress) => {
  assertDrivePublishingAllowed();
  const transfer = createTransferTimeout(init.signal ?? new AbortController().signal);
  try {
    return await new Promise<Response>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const cleanup = () => { transfer.signal.removeEventListener('abort', abort); };
      const abort = () => { xhr.abort(); cleanup(); reject(transfer.signal.reason); };
      transfer.signal.throwIfAborted();
      xhr.open(init.method ?? 'PUT', url);
      xhr.responseType = 'arraybuffer';
      new Headers(init.headers).forEach((value, key) => xhr.setRequestHeader(key, value));
      xhr.upload.onprogress = event => { transfer.activity(); progress?.(event.loaded); };
      xhr.onprogress = () => transfer.activity();
      xhr.onerror = () => { cleanup(); reject(new GoogleDrivePublishError('Google Drive upload was interrupted. Retry to resume it.')); };
      xhr.onload = () => {
        cleanup();
        try {
          const headers = new Headers();
          for (const line of xhr.getAllResponseHeaders().trim().split(/[\r\n]+/)) {
            const separator = line.indexOf(':');
            if (separator > 0) headers.append(line.slice(0, separator), line.slice(separator + 1).trim());
          }
          resolve(new Response(xhr.response, { status: xhr.status, headers }));
        } catch { reject(new GoogleDrivePublishError('Google Drive returned an unreadable upload response. Retry to check the upload.')); }
      };
      transfer.signal.addEventListener('abort', abort, { once: true });
      try { xhr.send(init.body as Blob | undefined); }
      catch (error) { cleanup(); reject(error); }
    });
  } finally { transfer.dispose(); }
};

export function driveSharingUrl(file: Pick<DrivePublishedFile, 'id' | 'resourceKey'>): string {
  const url = new URL(`https://drive.google.com/file/d/${validateDriveFileId(file.id)}/view`);
  if (file.resourceKey) url.searchParams.set('resourcekey', file.resourceKey);
  return url.href;
}

export function createDriveUploadClient(deps: {
  getAccessToken: () => string | null; expireSession?: () => void;
  fetchImpl?: DriveUploadRequest; uploadImpl?: DriveUploadRequest;
}) {
  const fetchImpl = deps.fetchImpl ?? ((url, init) => fetchWithTimeout(url, 60_000, init));
  const chunkImpl = deps.uploadImpl ?? uploadDriveChunk;
  const request = async (url: string, signal: AbortSignal, init: RequestInit = {}, progress?: (bytes: number) => void) => {
    assertDrivePublishingAllowed();
    signal.throwIfAborted();
    const token = deps.getAccessToken();
    if (!token) throw new GoogleDrivePublishError('Sign in with Google to allow uploads, then retry.', 401);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await (progress ? chunkImpl : fetchImpl)(url, { ...init, headers, signal, credentials: 'omit' }, progress);
    signal.throwIfAborted();
    if (response.ok || response.status === 308) return response;
    await response.body?.cancel().catch(() => {});
    if (response.status === 401) deps.expireSession?.();
    const message = response.status === 401 ? 'Google Drive sign-in expired. Reconnect the same account, then retry.'
      : response.status === 403 ? 'Google Drive denied this operation. Check file access, available storage, and your organization’s sharing rules.'
        : response.status === 429 ? 'Google Drive is limiting requests. Wait briefly, then retry.'
          : response.status === 404 ? 'The Google Drive file or upload session is unavailable. Reconnect the same account and retry.'
            : 'Google Drive upload was interrupted. Retry to check its status and resume.';
    throw new GoogleDrivePublishError(message, response.status);
  };
  const json = async <T>(response: Response): Promise<T> => JSON.parse(await (await readBoundedResponse(response, 64 * 1024)).text()) as T;
  const position = async (response: Response, size: number): Promise<{ complete: boolean; offset: number }> => {
    if (response.ok) { await response.body?.cancel(); return { complete: true, offset: size }; }
    const range = response.headers.get('Range');
    await response.body?.cancel();
    if (!range) return { complete: false, offset: 0 };
    const match = /^bytes=0-(\d+)$/.exec(range);
    const offset = match ? Number(match[1]) + 1 : NaN;
    if (!Number.isSafeInteger(offset) || offset <= 0 || offset >= size) throw new GoogleDrivePublishError('Google Drive returned invalid upload progress.');
    return { complete: false, offset };
  };
  return {
    async owner(signal: AbortSignal): Promise<string> {
      const data = await json<{ user?: { permissionId?: unknown } }>(await request(`${ROOT}/about?fields=user(permissionId)`, signal));
      if (typeof data.user?.permissionId !== 'string' || !data.user.permissionId) throw new GoogleDrivePublishError('Could not identify the connected Google Drive account.');
      return data.user.permissionId;
    },
    async generateId(signal: AbortSignal): Promise<string> {
      const data = await json<{ ids?: string[] }>(await request(`${ROOT}/files/generateIds?count=1&space=drive&type=files`, signal));
      return validateDriveFileId(data.ids?.[0] ?? '');
    },
    async file(id: string, signal: AbortSignal): Promise<DrivePublishedFile | null> {
      try { return await json<DrivePublishedFile>(await request(`${ROOT}/files/${validateDriveFileId(id)}?fields=${encodeURIComponent(FIELDS)}`, signal)); }
      catch (error) { if (error instanceof GoogleDrivePublishError && error.status === 404) return null; throw error; }
    },
    async start(id: string, name: string, operationId: string, size: number, signal: AbortSignal, update = false): Promise<string> {
      const url = new URL(update ? `${UPLOAD}/${validateDriveFileId(id)}` : UPLOAD);
      url.searchParams.set('uploadType', 'resumable');
      url.searchParams.set('fields', FIELDS);
      const response = await request(url.href, signal, {
        method: update ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/zip', 'X-Upload-Content-Length': String(size) },
        body: JSON.stringify({ ...(update ? {} : { id: validateDriveFileId(id) }), name, mimeType: 'application/zip', appProperties: { [DRIVE_OPERATION_KEY]: operationId } }),
      });
      const location = response.headers.get('Location');
      await response.body?.cancel();
      if (!location) throw new GoogleDrivePublishError('Google Drive did not return an upload session. Check your connection and retry.');
      return validateDriveUploadUrl(location);
    },
    async status(sessionUrl: string, size: number, signal: AbortSignal) {
      return position(await request(validateDriveUploadUrl(sessionUrl), signal, { method: 'PUT', headers: { 'Content-Range': `bytes */${size}` } }), size);
    },
    async chunk(sessionUrl: string, blob: Blob, offset: number, signal: AbortSignal, progress: (bytes: number) => void) {
      const end = Math.min(blob.size, offset + DRIVE_UPLOAD_CHUNK_BYTES);
      return position(await request(validateDriveUploadUrl(sessionUrl), signal, {
        method: 'PUT', headers: { 'Content-Type': 'application/zip', 'Content-Range': `bytes ${offset}-${end - 1}/${blob.size}` },
        body: blob.slice(offset, end),
      }, progress), blob.size);
    },
    async share(id: string, signal: AbortSignal): Promise<void> {
      const response = await request(`${ROOT}/files/${validateDriveFileId(id)}/permissions?fields=id`, signal, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'anyone', role: 'reader', allowFileDiscovery: false }),
      });
      await response.body?.cancel();
    },
  };
}
export type DriveUploadClient = ReturnType<typeof createDriveUploadClient>;
