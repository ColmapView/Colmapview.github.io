import type { UrlLoadError } from '../../types/manifest';
import type { GoogleDriveFileReference } from '../../utils/googleDriveUrl';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { getArchiveReadSizeLimit, validateArchiveSize } from '../../utils/zipValidation';
import { anySignal } from '../../utils/abortSignals';
import type { ZipUrlLoadOptions } from '../../utils/zipLoader';
import { googleDriveAuth } from './auth';
import { isGoogleDriveArchiveFilename } from './archivePolicy';
import { assertGoogleDriveHostAllowed, getGoogleDriveConfiguration, validateGoogleDriveApiKey } from './config';

interface DriveApiDeps {
  apiKey?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetchWithTimeout;
  getAccessToken?: () => string | null;
  expireSession?: (token: string) => void;
}

function driveError(reference: GoogleDriveFileReference, message: string, needsAccess = false): UrlLoadError {
  return { type: needsAccess ? 'auth' : 'unknown', message, failedFile: reference.sourceUrl,
    ...(needsAccess ? { access: { provider: 'google' as const } } : {}) };
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.body) return response.json();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) throw new Error('Google Drive returned an oversized metadata response.');
      text += decoder.decode(value, { stream: true });
    }
  } finally { void reader.cancel().catch(() => {}); }
  return JSON.parse(text + decoder.decode());
}

function apiReasons(body: unknown): string[] {
  const error = (body as { error?: { errors?: { reason?: string }[]; details?: { reason?: string }[] } } | null)?.error;
  return [...(Array.isArray(error?.errors) ? error.errors : []), ...(Array.isArray(error?.details) ? error.details : [])]
    .map(item => typeof item?.reason === 'string' ? item.reason : '');
}

/** Check bytes as well as the filename without buffering the archive download. */
async function requireZipResponse(response: Response, reference: GoogleDriveFileReference): Promise<Response> {
  if (!response.body) throw driveError(reference, 'This Drive file must contain a ZIP archive (.zip).');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  const prefix = new Uint8Array(4);
  let length = 0;
  try {
    while (length < prefix.length) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      const bytes = value.subarray(0, prefix.length - length);
      prefix.set(bytes, length);
      length += bytes.length;
    }
    if (length !== 4 || prefix[0] !== 0x50 || prefix[1] !== 0x4b
      || !((prefix[2] === 3 && prefix[3] === 4) || (prefix[2] === 5 && prefix[3] === 6) || (prefix[2] === 7 && prefix[3] === 8))) {
      throw driveError(reference, 'This file is named .zip but does not contain a ZIP archive. Use the archive\'s correct filename and format.');
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    throw error;
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) { reader.releaseLock(); controller.close(); }
        else controller.enqueue(value);
      } catch (error) { reader.releaseLock(); controller.error(error); }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } finally { reader.releaseLock(); }
    },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

export async function resolveGoogleDriveArchive(reference: GoogleDriveFileReference, deps: DriveApiDeps = {}): Promise<{
  url: string;
  options: ZipUrlLoadOptions;
}> {
  const assertHosting = () => {
    try { assertGoogleDriveHostAllowed(); }
    catch (error) { throw driveError(reference, (error as Error).message); }
  };
  assertHosting();
  const configuration = getGoogleDriveConfiguration();
  const apiKey = validateGoogleDriveApiKey(deps.apiKey ?? configuration.apiKey ?? undefined);
  if (import.meta.env.PROD && !configuration.apiKey && !configuration.clientId) {
    throw driveError(reference, 'Google Drive loading is not configured for this viewer.');
  }
  const getAccessToken = deps.getAccessToken ?? (() => googleDriveAuth.getAccessToken());
  const expireSession = deps.expireSession ?? googleDriveAuth.expire;
  const fetchImpl = deps.fetchImpl ?? fetchWithTimeout;
  const root = `https://www.googleapis.com/drive/v3/files/${reference.fileId}`;
  const makeUrl = (media: boolean) => {
    const url = new URL(root);
    if (apiKey) url.searchParams.set('key', apiKey);
    url.searchParams.set('supportsAllDrives', 'true');
    if (media) url.searchParams.set('alt', 'media');
    else url.searchParams.set('fields', 'id,name,mimeType,size,capabilities(canDownload),trashed');
    return url.href;
  };
  let useAccount = false;
  /** The answer, with the account token the request sent (null for an anonymous request). */
  const request = async (url: string, timeout?: number, init?: RequestInit): Promise<[Response, string | null]> => {
    assertHosting();
    const headers = new Headers();
    const range = new Headers(init?.headers).get('range');
    if (range) {
      if (!/^bytes=\d+-\d+$/.test(range)) throw driveError(reference, 'Invalid Google Drive byte range.');
      headers.set('Range', range);
    }
    if (reference.resourceKey) headers.set('X-Goog-Drive-Resource-Keys', `${reference.fileId}/${reference.resourceKey}`);
    let sentToken: string | null = null;
    if (useAccount) {
      if (import.meta.env.PROD && !configuration.clientId) {
        throw driveError(reference, 'Google Drive sign-in is not configured for this viewer.');
      }
      sentToken = getAccessToken();
      if (!sentToken) throw driveError(reference, 'Sign in with Google Drive, then choose this archive in the Drive picker.', true);
      headers.set('Authorization', `Bearer ${sentToken}`);
    }
    const signal = init?.signal ? (deps.signal ? anySignal([deps.signal, init.signal]) : init.signal) : deps.signal;
    return [await fetchImpl(url, timeout, { headers, credentials: 'omit', signal }), sentToken];
  };
  // The account only reaches files chosen in the picker, which also needs the API key.
  if (!apiKey) {
    throw driveError(reference, 'Google Drive loading is not configured for this viewer. Contact the site administrator.');
  }
  // A rejection expires only the session that sent `requestToken`: one signed in while the request ran stays connected.
  const checkResponse = async (response: Response, requestToken: string | null) => {
    if (response.ok) return;
    let body: unknown;
    try { body = await readJson(response); } catch { deps.signal?.throwIfAborted(); }
    const reasons = apiReasons(body);
    let message: string;
    let needsAccess = false;
    if (reasons.some(reason => /rateLimit|quota|downloadQuota|RESOURCE_EXHAUSTED/i.test(reason)) || response.status === 429) {
      message = 'Google Drive is limiting downloads. Wait a little, then retry.';
    } else if (reasons.some(reason => /API_KEY|SERVICE_DISABLED|accessNotConfigured/.test(reason))) {
      message = 'Google Drive is not configured for this viewer address. Contact the site administrator.';
    } else if (response.status === 401 && requestToken) {
      needsAccess = true;
      expireSession(requestToken);
      message = 'Google Drive sign-in expired or was revoked. Sign in again, then choose the archive in the Drive picker.';
    } else if (requestToken && reasons.some(reason => /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(reason))) {
      needsAccess = true;
      expireSession(requestToken);
      message = 'Google Drive file permission is missing. Sign in again, then choose the archive in the Drive picker.';
    } else if (response.status === 403 || response.status === 404) {
      needsAccess = true;
      message = requestToken
        ? 'Choose this archive in the Drive picker to grant file access. If it is still unavailable, check the account and download permissions.'
        : 'This Drive link could not be opened. It may be private or no longer available.';
    } else {
      message = `Google Drive could not download this file (${response.status}). Please retry.`;
    }
    throw driveError(reference, message, needsAccess);
  };
  const readMetadata = async (response: Response, requestToken: string | null) => {
    await checkResponse(response, requestToken);
    const data = await readJson(response) as { id?: unknown; name?: unknown; mimeType?: unknown; size?: unknown; trashed?: unknown; capabilities?: { canDownload?: unknown } };
    deps.signal?.throwIfAborted();
    if (!data || data.id !== reference.fileId || typeof data.name !== 'string' || data.name.length > 1024
      || typeof data.size !== 'string' || !/^\d+$/.test(data.size) || !Number.isSafeInteger(Number(data.size)) || Number(data.size) <= 0) {
      throw driveError(reference, 'This Drive link must point to an uploaded archive file, rather than a folder or Google document.');
    }
    return { ...data, name: data.name, size: data.size };
  };
  let [response, metadataToken] = await request(makeUrl(false));
  // Public files stay anonymous. drive.file permits the private fallback only for app-created/selected files.
  if (!useAccount && [403, 404].includes(response.status) && getAccessToken()) {
    await response.body?.cancel().catch(() => {});
    deps.signal?.throwIfAborted();
    useAccount = true;
    [response, metadataToken] = await request(makeUrl(false));
  }
  let data = await readMetadata(response, metadataToken);
  // canDownload describes the requester: a connected owner may download a file its anonymous readers cannot.
  if (!useAccount && !data.trashed && data.capabilities?.canDownload === false && getAccessToken()) {
    deps.signal?.throwIfAborted();
    useAccount = true;
    [response, metadataToken] = await request(makeUrl(false));
    data = await readMetadata(response, metadataToken);
  }
  if (data.trashed || data.capabilities?.canDownload === false) {
    throw driveError(reference, 'Downloading is disabled for this Drive file. Ask the owner to allow downloads.');
  }
  const filename = data.name.split(/[\\/]/).pop() ?? '';
  if (!isGoogleDriveArchiveFilename(filename)) {
    throw driveError(reference, 'This Drive file must be a ZIP or TAR archive, including supported compressed TAR formats. Choose an archive in the Drive picker.');
  }
  const size = Number(data.size);
  const validation = validateArchiveSize(size, getArchiveReadSizeLimit(filename));
  if (!validation.valid) throw driveError(reference, validation.error ?? 'Archive is too large.');
  return { url: makeUrl(true), options: {
    filename, size,
    fetchImpl: async (url, timeout, init) => {
      // The downloader receives only this fixed media endpoint; credentials cannot be sent to arbitrary URLs.
      if (url !== makeUrl(true)) throw driveError(reference, 'Unexpected Google Drive download URL.');
      const [media, mediaToken] = await request(url, timeout, init);
      await checkResponse(media, mediaToken);
      if (new Headers(init?.headers).has('range') && (media.status === 200 || media.status === 206)) return media;
      if (media.status !== 200) {
        await media.body?.cancel().catch(() => {});
        throw driveError(reference, 'Google Drive returned an incomplete archive. Please retry.');
      }
      // The shared archive worker validates TAR variants, including V7 headers without a magic string.
      return filename.toLowerCase().endsWith('.zip') ? requireZipResponse(media, reference) : media;
    },
  } };
}
