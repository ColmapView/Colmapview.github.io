import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseGoogleDriveFileUrl } from '../../utils/googleDriveUrl';
import { ARCHIVE_SIZE_LIMIT } from '../../utils/zipValidation';
import { resolveGoogleDriveArchive } from './api';

const reference = parseGoogleDriveFileUrl('https://drive.google.com/file/d/file123/view?resourcekey=0-key')!;
const metadata = { id: reference.fileId, name: 'wrapped.zip', mimeType: 'application/zip', size: '1024', capabilities: { canDownload: true } };
const publicDeps = { apiKey: 'app-key', getAccessToken: () => null };
const zipBytes = new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3, 4]);
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Google Drive archive API', () => {
  it.each(['https://opsiclear.github.io', 'https://colmap-webview.pages.dev', 'https://preview.colmap-webview.pages.dev'])('makes no metadata request on disabled host %s despite injected credentials', async origin => {
    vi.stubGlobal('location', { origin });
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
    vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', 'https://colmapview.opsiclear.com');
    const fetchImpl = vi.fn();
    const getAccessToken = vi.fn(() => 'private-token');
    await expect(resolveGoogleDriveArchive(reference, { ...publicDeps, fetchImpl, getAccessToken }))
      .rejects.toMatchObject({ message: expect.stringContaining('available at'), failedFile: reference.sourceUrl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(getAccessToken).not.toHaveBeenCalled();
  });
  it('blocks a prepared media request if capability is explicitly disabled afterward', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json(metadata));
    const source = await resolveGoogleDriveArchive(reference, { ...publicDeps, fetchImpl });
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'false');
    await expect(source.options.fetchImpl!(source.url)).rejects.toMatchObject({ message: expect.stringContaining('available at') });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('requires valid production action configuration before allowing anonymous requests', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    vi.stubGlobal('location', { origin: 'https://colmapview.opsiclear.com' });
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
    vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', 'https://colmapview.opsiclear.com');
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', '');
    vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '');
    const fetchImpl = vi.fn().mockResolvedValue(Response.json(metadata));
    await expect(resolveGoogleDriveArchive(reference, { ...publicDeps, fetchImpl })).rejects.toMatchObject({ message: expect.stringContaining('not configured') });
    expect(fetchImpl).not.toHaveBeenCalled();
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'app-key');
    await expect(resolveGoogleDriveArchive(reference, { fetchImpl })).resolves.toMatchObject({ options: { filename: 'wrapped.zip' } });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('does not authenticate a production private fallback without a configured OAuth client', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    vi.stubGlobal('location', { origin: 'https://colmapview.opsiclear.com' });
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
    vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', 'https://colmapview.opsiclear.com');
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'app-key');
    vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', 'invalid');
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({}, { status: 404 }));
    await expect(resolveGoogleDriveArchive(reference, { fetchImpl, getAccessToken: () => 'injected-token' }))
      .rejects.toMatchObject({ message: expect.stringContaining('not configured') });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][2].headers.get('Authorization')).toBeNull();
  });

  it('loads public metadata and media without account credentials or HEAD requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json(metadata)).mockResolvedValueOnce(new Response(zipBytes));
    const source = await resolveGoogleDriveArchive(reference, { ...publicDeps, getAccessToken: () => 'unused-private-token', fetchImpl });
    expect(source.options).toMatchObject({ filename: 'wrapped.zip', size: 1024 });
    expect(new URL(source.url).origin).toBe('https://www.googleapis.com');
    expect(new URL(source.url).searchParams.get('alt')).toBe('media');
    const media = await source.options.fetchImpl!(source.url, 120000);
    expect(new Uint8Array(await media.arrayBuffer())).toEqual(zipBytes);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, , init] of fetchImpl.mock.calls) {
      expect(init.credentials).toBe('omit');
      expect(init.headers.get('Authorization')).toBeNull();
      expect(init.headers.get('X-Goog-Drive-Resource-Keys')).toBe('file123/0-key');
    }
  });
  it('retries private metadata with the connected account and authenticates the media request', async () => {
    const signal = new AbortController().signal;
    const getAccessToken = vi.fn(() => 'test-private-token');
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ error: {} }, { status: 404 }))
      .mockResolvedValueOnce(Response.json(metadata)).mockResolvedValueOnce(new Response(zipBytes));
    const source = await resolveGoogleDriveArchive(reference, { apiKey: 'app-key', getAccessToken, fetchImpl, signal });
    await source.options.fetchImpl!(source.url);
    expect(fetchImpl.mock.calls[0][2].headers.get('Authorization')).toBeNull();
    for (const call of fetchImpl.mock.calls.slice(1)) {
      expect(call[2].headers.get('Authorization')).toBe('Bearer test-private-token');
      expect(call[2].signal).toBe(signal);
      expect(call[2].credentials).toBe('omit');
    }
  });
  it.each([
    ['wrapped.tar', 'application/x-tar'], ['wrapped.tar', 'application/octet-stream'],
    ['wrapped.tar.gz', 'application/gzip'], ['wrapped.tgz', 'application/octet-stream'],
    ['wrapped.tar.bz2', 'application/x-bzip2'], ['wrapped.tbz2', 'application/octet-stream'],
    ['wrapped.tbz', 'application/x-bzip2'], ['wrapped.tar.xz', 'application/x-xz'], ['wrapped.txz', 'application/octet-stream'],
  ])('streams a public TAR archive %s (%s) to the shared decoder without imposing ZIP or USTAR magic', async (name, mimeType) => {
    // V7 TAR has no USTAR magic; actual parsing belongs to the shared libarchive decoder.
    const tarBytes = new Uint8Array(1024);
    tarBytes.set(new TextEncoder().encode('images/test.jpg'));
    const originalMedia = new Response(tarBytes);
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ ...metadata, name, mimeType }))
      .mockResolvedValueOnce(originalMedia);
    const source = await resolveGoogleDriveArchive(reference, { ...publicDeps, getAccessToken: () => 'unused-token', fetchImpl });
    expect(source.options.filename).toBe(name);
    const media = await source.options.fetchImpl!(source.url);
    expect(media).toBe(originalMedia);
    expect(media.bodyUsed).toBe(false);
    expect(new Uint8Array(await media.arrayBuffer())).toEqual(tarBytes);
    for (const [, , init] of fetchImpl.mock.calls) expect(init.headers.get('Authorization')).toBeNull();
  });
  it('loads a selected private TAR via file-scoped authorization and rechecks expiry before download', async () => {
    const getAccessToken = vi.fn((): string | null => 'selected-file-token');
    const tar = { ...metadata, name: 'private.tar', mimeType: 'application/octet-stream' };
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ error: {} }, { status: 404 }))
      .mockResolvedValueOnce(Response.json(tar)).mockResolvedValueOnce(new Response(new Uint8Array(1024)));
    const source = await resolveGoogleDriveArchive(reference, { apiKey: 'app-key', getAccessToken, fetchImpl });
    const media = await source.options.fetchImpl!(source.url);
    await media.arrayBuffer();
    expect(fetchImpl.mock.calls[0][2].headers.get('Authorization')).toBeNull();
    for (const [, , init] of fetchImpl.mock.calls.slice(1)) {
      expect(init.headers.get('Authorization')).toBe('Bearer selected-file-token');
      expect(init.headers.get('X-Goog-Drive-Resource-Keys')).toBe('file123/0-key');
    }
    getAccessToken.mockReturnValue(null);
    await expect(source.options.fetchImpl!(source.url)).rejects.toMatchObject({ message: expect.stringContaining('choose this archive') });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('does not start an authorization popup for an inaccessible anonymous file', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ error: {} }, { status: 404 }));
    await expect(resolveGoogleDriveArchive(reference, { ...publicDeps, fetchImpl }))
      .rejects.toMatchObject({ message: expect.stringContaining('Google Drive icon'), failedFile: reference.sourceUrl });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it.each([false, true])('handles rejected response cancellation while preserving caller cancellation (%s)', async cancelled => {
    const controller = new AbortController();
    const body = new ReadableStream({ cancel() {
      if (cancelled) controller.abort();
      return Promise.reject(new DOMException('Body stream was aborted', 'AbortError'));
    } });
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(body, { status: 404 }))
      .mockResolvedValueOnce(Response.json(metadata));
    const pending = resolveGoogleDriveArchive(reference, {
      apiKey: 'app-key', getAccessToken: () => 'token', signal: controller.signal, fetchImpl,
    });
    if (cancelled) {
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(fetchImpl).toHaveBeenCalledOnce();
    } else {
      await expect(pending).resolves.toMatchObject({ options: { filename: metadata.name } });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
  });
  it.each([
    [{ ...metadata, name: 'image.jpg' }, 'ZIP or TAR archive'],
    [{ ...metadata, name: 'wrapped.gz' }, 'ZIP or TAR archive'],
    [{ ...metadata, name: 'wrapped.7z' }, 'ZIP or TAR archive'],
    [{ ...metadata, size: String(ARCHIVE_SIZE_LIMIT + 1) }, 'limit'],
    [{ ...metadata, size: 'NaN' }, 'uploaded archive'],
    [{ ...metadata, size: '-1' }, 'uploaded archive'],
    [{ ...metadata, mimeType: 'application/vnd.google-apps.folder', size: undefined }, 'uploaded archive'],
    [{ ...metadata, capabilities: { canDownload: false } }, 'disabled'],
    [{ ...metadata, trashed: true }, 'disabled'],
    [{ ...metadata, id: 'other-file' }, 'uploaded archive'],
  ])('rejects unusable metadata before media downloading', async (body, expected) => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json(body));
    await expect(resolveGoogleDriveArchive(reference, { ...publicDeps, fetchImpl }))
      .rejects.toMatchObject({ message: expect.stringContaining(expected) });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it.each([
    [403, 'downloadQuotaExceeded', 'limiting downloads'],
    [429, '', 'limiting downloads'],
    [403, 'API_KEY_HTTP_REFERRER_BLOCKED', 'viewer address'],
    [403, 'SERVICE_DISABLED', 'viewer address'],
    [503, '', 'retry'],
  ])('provides safe actionable API errors for %s/%s', async (status, reason, message) => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ error: { message: 'secret provider URL', details: [{ reason }] } }, { status }));
    await expect(resolveGoogleDriveArchive(reference, { ...publicDeps, fetchImpl }))
      .rejects.toMatchObject({ message: expect.stringContaining(message), failedFile: reference.sourceUrl });
  });
  it('expires a rejected account session instead of silently refreshing or exposing credentials', async () => {
    const expireSession = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ error: {} }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ error: {} }, { status: 401 }));
    await expect(resolveGoogleDriveArchive(reference, { apiKey: 'app-key', getAccessToken: () => 'token', expireSession, fetchImpl }))
      .rejects.toMatchObject({ message: expect.stringContaining('expired') });
    expect(expireSession).toHaveBeenCalledOnce();
  });
  it('expires insufficient-scope grants and tells the user to choose the archive through Picker', async () => {
    const expireSession = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ error: {} }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ error: { details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] } }, { status: 403 }));
    await expect(resolveGoogleDriveArchive(reference, { apiKey: 'app-key', getAccessToken: () => 'token', expireSession, fetchImpl }))
      .rejects.toMatchObject({ message: expect.stringContaining('choose the archive in the Drive picker') });
    expect(expireSession).toHaveBeenCalledOnce();
  });
  it('tells connected users to select a file when drive.file cannot access an arbitrary pasted private link', async () => {
    const expireSession = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ error: {} }, { status: 404 }));
    await expect(resolveGoogleDriveArchive(reference, { apiKey: 'app-key', getAccessToken: () => 'token', expireSession, fetchImpl }))
      .rejects.toMatchObject({ message: expect.stringContaining('Choose this archive in the Drive picker') });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(expireSession).not.toHaveBeenCalled();
  });
  it.each(['not a ZIP', '7z\u00bc\u00af\u0027\u001c', 'PK'])('rejects non-ZIP bytes even when the file is named .zip (%s)', async content => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json(metadata)).mockResolvedValueOnce(new Response(content));
    const source = await resolveGoogleDriveArchive(reference, { ...publicDeps, fetchImpl });
    await expect(source.options.fetchImpl!(source.url)).rejects.toMatchObject({ message: expect.stringContaining('does not contain a ZIP') });
  });
  it('checks a ZIP signature across chunks and preserves the complete body', async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(zipBytes.subarray(0, 1));
      controller.enqueue(zipBytes.subarray(1, 3));
      controller.enqueue(zipBytes.subarray(3));
      controller.close();
    } });
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json(metadata)).mockResolvedValueOnce(new Response(body));
    const source = await resolveGoogleDriveArchive(reference, { ...publicDeps, fetchImpl });
    const media = await source.options.fetchImpl!(source.url);
    expect(new Uint8Array(await media.arrayBuffer())).toEqual(zipBytes);
  });
  it('blocks credential forwarding to any other URL and checks account expiry before media', async () => {
    const getAccessToken = vi.fn().mockReturnValue('token');
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ error: {} }, { status: 404 }))
      .mockResolvedValueOnce(Response.json(metadata));
    const source = await resolveGoogleDriveArchive(reference, { apiKey: 'app-key', getAccessToken, fetchImpl });
    await expect(source.options.fetchImpl!('https://evil.example/archive.zip')).rejects.toMatchObject({ message: 'Unexpected Google Drive download URL.' });
    getAccessToken.mockReturnValue(null);
    await expect(source.options.fetchImpl!(source.url)).rejects.toMatchObject({ message: expect.stringContaining('Sign in') });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('bounds malformed API response bodies', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('a'.repeat(20000)));
    await expect(resolveGoogleDriveArchive(reference, { ...publicDeps, fetchImpl })).rejects.toThrow('oversized');
  });
});
