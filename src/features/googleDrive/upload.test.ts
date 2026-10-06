import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDriveUploadClient, DRIVE_UPLOAD_CHUNK_BYTES, uploadDriveChunk, validateDriveUploadUrl, type DriveUploadRequest } from './upload';

const fileId = 'DRIVE_FILE_123456789';
const session = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=fixture';
beforeEach(() => { vi.stubGlobal('Blob', NodeBlob); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function clientWith(responses: Response[]) {
  const request = vi.fn<DriveUploadRequest>().mockImplementation(async () => responses.shift()!);
  const expireSession = vi.fn();
  return { request, expireSession, client: createDriveUploadClient({ getAccessToken: () => 'upload-test-token', expireSession, fetchImpl: request, uploadImpl: request }) };
}

describe('Drive resumable upload transport', () => {
  it('blocks metadata, sharing, and chunks on disabled hosts before reading a token or calling transports', async () => {
    vi.stubGlobal('location', { origin: 'https://preview.colmap-webview.pages.dev' });
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
    vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', 'https://colmapview.opsiclear.com');
    const request = vi.fn();
    const getAccessToken = vi.fn(() => 'injected-upload-token');
    const client = createDriveUploadClient({ getAccessToken, fetchImpl: request, uploadImpl: request });
    const signal = new AbortController().signal;
    await expect(client.owner(signal)).rejects.toThrow('available at');
    await expect(client.share(fileId, signal)).rejects.toThrow('available at');
    await expect(client.chunk(session, new Blob(['zip']), 0, signal, () => {})).rejects.toThrow('available at');
    expect(request).not.toHaveBeenCalled();
    expect(getAccessToken).not.toHaveBeenCalled();
  });
  it('blocks direct XHR uploads and explicitly disabled loopback API requests', async () => {
    const xhr = vi.fn();
    vi.stubGlobal('XMLHttpRequest', xhr);
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'false');
    await expect(uploadDriveChunk(session, { body: new Blob(['zip']) })).rejects.toThrow('available at');
    const { client, request } = clientWith([]);
    await expect(client.generateId(new AbortController().signal)).rejects.toThrow('available at');
    expect(xhr).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
  it('requires a configured OAuth client in production but does not require Picker-only fields for publishing', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    vi.stubGlobal('location', { origin: 'https://colmapview.opsiclear.com' });
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
    vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', 'https://colmapview.opsiclear.com');
    vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '');
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', '');
    vi.stubEnv('VITE_GOOGLE_DRIVE_APP_ID', '');
    const { client, request } = clientWith([Response.json({ user: { permissionId: 'owner' } })]);
    await expect(client.owner(new AbortController().signal)).rejects.toThrow('not configured');
    const xhr = vi.fn();
    vi.stubGlobal('XMLHttpRequest', xhr);
    await expect(uploadDriveChunk(session, { body: new Blob(['zip']) })).rejects.toThrow('not configured');
    expect(request).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '123456-client.apps.googleusercontent.com');
    await expect(client.owner(new AbortController().signal)).resolves.toBe('owner');
    expect(request).toHaveBeenCalledOnce();
  });

  it('creates a ZIP session with a fixed ID and operation marker, then uses the server’s acknowledged offset', async () => {
    const { client, request } = clientWith([new Response(null, { headers: { Location: session } }),
      new Response(null, { status: 308, headers: { Range: 'bytes=0-4194303' } }), new Response('{}')]);
    const signal = new AbortController().signal;
    expect(await client.start(fileId, 'dataset.zip', 'operation-id', DRIVE_UPLOAD_CHUNK_BYTES + 13, signal)).toBe(session);
    const create = request.mock.calls[0][1];
    expect(JSON.parse(create.body as string)).toMatchObject({ id: fileId, name: 'dataset.zip', mimeType: 'application/zip', appProperties: { colmapviewOperation: 'operation-id' } });
    const blob = new Blob([new Uint8Array(DRIVE_UPLOAD_CHUNK_BYTES + 13)]);
    expect(await client.chunk(session, blob, 0, signal, () => {})).toEqual({ complete: false, offset: 4194304 });
    expect(new Headers(request.mock.calls[1][1].headers).get('Content-Range')).toBe(`bytes 0-${DRIVE_UPLOAD_CHUNK_BYTES - 1}/${blob.size}`);
    expect((request.mock.calls[1][1].body as Blob).size).toBe(DRIVE_UPLOAD_CHUNK_BYTES);
    expect(await client.chunk(session, blob, 4194304, signal, () => {})).toEqual({ complete: true, offset: blob.size });
    for (const [, init] of request.mock.calls) {
      expect(init.credentials).toBe('omit');
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer upload-test-token');
    }
  });
  it.each(['https://evil.test/upload?upload_id=bad', 'http://www.googleapis.com/upload/drive/v3/files?upload_id=bad',
    'https://www.googleapis.com/drive/v3/files?upload_id=bad', 'https://user:password@www.googleapis.com/upload/drive/v3/files?upload_id=bad'])('rejects an untrusted upload address without sending credentials: %s', async url => {
    const { client, request } = clientWith([]);
    await expect(client.status(url, 20, new AbortController().signal)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    expect(() => validateDriveUploadUrl(url)).toThrow();
  });
  it('queries prior upload status without a body and distinguishes an expired session from zero received bytes', async () => {
    const { client, request } = clientWith([new Response(null, { status: 308 }), new Response(null, { status: 404 })]);
    expect(await client.status(session, 20, new AbortController().signal)).toEqual({ complete: false, offset: 0 });
    expect(new Headers(request.mock.calls[0][1].headers).get('Content-Range')).toBe('bytes */20');
    expect(request.mock.calls[0][1].body).toBeUndefined();
    await expect(client.status(session, 20, new AbortController().signal)).rejects.toMatchObject({ status: 404 });
  });
  it.each(['invalid', 'bytes=4-8', 'bytes=0-19', 'bytes=0-9007199254740993'])('rejects invalid or impossible acknowledgements: %s', async range => {
    const { client } = clientWith([new Response(null, { status: 308, headers: { Range: range } })]);
    await expect(client.status(session, 20, new AbortController().signal)).rejects.toThrow('invalid upload progress');
  });
  it('expires rejected credentials and presents safe quota/permission errors without provider data', async () => {
    const { client, expireSession } = clientWith([new Response('secret provider URL', { status: 401 }), new Response('other secret', { status: 403 }), new Response(null, { status: 429 })]);
    await expect(client.owner(new AbortController().signal)).rejects.toThrow('sign-in expired');
    expect(expireSession).toHaveBeenCalledOnce();
    await expect(client.owner(new AbortController().signal)).rejects.toThrow('available storage');
    await expect(client.owner(new AbortController().signal)).rejects.toThrow('limiting requests');
  });
  it('refuses signed-out and cancelled requests before calling the API', async () => {
    const request = vi.fn();
    const client = createDriveUploadClient({ getAccessToken: () => null, fetchImpl: request });
    await expect(client.generateId(new AbortController().signal)).rejects.toThrow('Sign in');
    const controller = new AbortController(); controller.abort();
    await expect(client.owner(controller.signal)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it('enables reader link access only, with discovery disabled', async () => {
    const { client, request } = clientWith([new Response('{}')]);
    await client.share(fileId, new AbortController().signal);
    expect(JSON.parse(request.mock.calls[0][1].body as string)).toEqual({ type: 'anyone', role: 'reader', allowFileDiscovery: false });
  });
  it('keeps active XHR uploads alive beyond the inactivity deadline and cleans up on cancellation', async () => {
    vi.useFakeTimers();
    const instances: UploadFixture[] = [];
    class UploadFixture {
      upload: { onprogress?: (event: { loaded: number }) => void } = {};
      abort = vi.fn(); open = vi.fn(); setRequestHeader = vi.fn(); send = vi.fn();
      constructor() { instances.push(this); }
    }
    vi.stubGlobal('XMLHttpRequest', UploadFixture);
    const controller = new AbortController();
    const progress = vi.fn();
    try {
      const pending = uploadDriveChunk(session, { body: new Blob(['zip']), signal: controller.signal }, progress);
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        instances[0].upload.onprogress!({ loaded: i + 1 });
      }
      expect(instances[0].abort).not.toHaveBeenCalled();
      expect(progress.mock.calls.map(([bytes]) => bytes)).toEqual([1, 2, 3]);
      controller.abort(); await rejected;
      expect(instances[0].abort).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
