import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hfAuth, type HfAuthState } from './auth';
import { checkHuggingFaceDatasetAccess, fetchHuggingFaceDatasetRequest } from './datasetAccess';
import { fetchDatasetResource } from '../../utils/fetchDatasetResource';
import { downloadZip } from '../../utils/zipDownload';
import { UrlMediaScheduler } from '../../dataset/urlMediaScheduler';
import { getOrLoadFrustumBitmap } from '../../hooks/frustumTextureCache';

vi.mock('./auth', () => ({ hfAuth: { getReadAccessToken: vi.fn(), getSnapshot: vi.fn(), expire: vi.fn() } }));
const root = 'https://huggingface.co/datasets/owner/scene/resolve/main/';
const info = 'https://huggingface.co/api/datasets/owner/scene';
const request = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const authorization = (init?: RequestInit) => new Headers(init?.headers).get('Authorization');

function connected(token = 'test-private-access') {
  const state: HfAuthState = { status: 'connected', identity: { username: 'owner' }, error: null };
  vi.mocked(hfAuth.getSnapshot).mockReturnValue(state);
  vi.mocked(hfAuth.getReadAccessToken).mockReturnValue(token);
  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  request.mockReset();
  vi.stubGlobal('fetch', request);
  vi.mocked(hfAuth.getSnapshot).mockReturnValue({ status: 'disconnected', identity: null, error: null });
  vi.mocked(hfAuth.getReadAccessToken).mockReturnValue(null);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Hugging Face private dataset reads', () => {
  it('checks access using only the privacy expansion and discards the body without reading metadata', async () => {
    const pull = vi.fn();
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }));
    const json = vi.spyOn(response, 'json');
    const text = vi.spyOn(response, 'text');
    const fetchImpl = vi.fn(async () => response);
    await expect(checkHuggingFaceDatasetAccess(info + '?expand=siblings&expand%5B%5D=cardData', fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(info + '?expand=private');
    expect(pull).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('keeps the lean public preflight anonymous even when connected', async () => {
    connected();
    request.mockResolvedValueOnce(Response.json({ id: 'owner/scene', private: false }));
    await checkHuggingFaceDatasetAccess(info, url => fetchDatasetResource(url));
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toBe(info + '?expand=private');
    expect(authorization(request.mock.calls[0][1])).toBeNull();
    expect(hfAuth.getReadAccessToken).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404])('preserves private authorization fallback for the lean preflight (%s)', async status => {
    connected();
    request.mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(Response.json({ id: 'owner/scene', private: true }));
    await checkHuggingFaceDatasetAccess(info, url => fetchDatasetResource(url));
    expect(request.mock.calls.map(([url]) => url)).toEqual([info + '?expand=private', info + '?expand=private']);
    expect(authorization(request.mock.calls[0][1])).toBeNull();
    expect(authorization(request.mock.calls[1][1])).toBe('Bearer test-private-access');
    expect(hfAuth.expire).not.toHaveBeenCalled();
  });

  it('keeps public reads anonymous even when connected', async () => {
    connected();
    request.mockResolvedValue(new Response('public'));
    expect(await (await fetchDatasetResource(root + 'cameras.bin')).text()).toBe('public');
    expect(request).toHaveBeenCalledOnce();
    expect(authorization(request.mock.calls[0][1])).toBeNull();
    expect(request.mock.calls[0][1]?.credentials).toBe('omit');
    expect(hfAuth.getReadAccessToken).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404])('retries a private %s with a header token and preserves Range', async status => {
    connected();
    const cancel = vi.fn();
    request.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { status }))
      .mockResolvedValueOnce(new Response('private', { status: 206 }));
    const response = await fetchDatasetResource(root + 'splats/scene.ply', undefined, { headers: { Range: 'bytes=0-63' } });
    expect(await response.text()).toBe('private');
    expect(cancel).toHaveBeenCalledOnce();
    const init = request.mock.calls[1][1];
    expect(authorization(init)).toBe('Bearer test-private-access');
    expect(new Headers(init?.headers).get('Range')).toBe('bytes=0-63');
    expect(init).toMatchObject({ credentials: 'omit', cache: 'no-store' });
    expect(request.mock.calls.map(([url]) => url)).toEqual([root + 'splats/scene.ply', root + 'splats/scene.ply']);
  });

  it('reuses private routing for lazy media, then resets it on reconnect and for other repos', async () => {
    connected();
    request.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ id: 'owner/scene' }))
      .mockResolvedValueOnce(new Response('image'))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response('new session'))
      .mockResolvedValueOnce(new Response('another public repo'));
    await checkHuggingFaceDatasetAccess(info, url => fetchDatasetResource(url));
    expect(await (await fetchDatasetResource(root + 'images/photo.png')).text()).toBe('image');
    expect(authorization(request.mock.calls[2][1])).toBe('Bearer test-private-access');
    connected('second-session');
    expect(await (await fetchDatasetResource(root + 'images/photo.png')).text()).toBe('new session');
    expect(authorization(request.mock.calls[3][1])).toBeNull();
    expect(authorization(request.mock.calls[4][1])).toBe('Bearer second-session');
    await (await fetchDatasetResource(root.replace('owner/scene', 'other/public') + 'images/photo.png')).text();
    expect(authorization(request.mock.calls[5][1])).toBeNull();
  });

  it.each([
    'https://huggingface.co.evil.test/datasets/owner/scene/resolve/main/file',
    'https://cdn.huggingface.co/datasets/owner/scene/resolve/main/file',
    'http://huggingface.co/datasets/owner/scene/resolve/main/file',
    'https://token@huggingface.co/datasets/owner/scene/resolve/main/file',
    'https://huggingface.co/api/whoami-v2',
    'https://huggingface.co/api/datasets/owner/scene/settings',
    'https://huggingface.co/datasets/owner/scene/discussions',
    'https://example.com/images/photo.jpg',
  ])('never supplies the account token to %s', async url => {
    connected();
    request.mockResolvedValue(new Response(null, { status: 401 }));
    await fetchHuggingFaceDatasetRequest(url);
    expect(authorization(request.mock.calls[0][1])).toBeNull();
    expect(hfAuth.getReadAccessToken).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledOnce();
  });

  it('never authenticates writes or replaces an explicit caller authorization header', async () => {
    connected();
    request.mockImplementation(async () => new Response(null));
    await fetchHuggingFaceDatasetRequest(info, { method: 'POST' });
    await fetchHuggingFaceDatasetRequest(info, { headers: { Authorization: 'Bearer caller-token' } });
    expect(authorization(request.mock.calls[0][1])).toBeNull();
    expect(authorization(request.mock.calls[1][1])).toBe('Bearer caller-token');
    expect(hfAuth.getReadAccessToken).not.toHaveBeenCalled();
  });

  it('explains private access without opening OAuth or accepting missing credentials', async () => {
    request.mockImplementation(async () => new Response('provider error', { status: 401 }));
    await expect(fetchDatasetResource(info)).rejects.toThrow('Sign in with Hugging Face');
    expect(request).toHaveBeenCalledOnce();
    expect(hfAuth.expire).not.toHaveBeenCalled();
  });

  it.each([false, true])('explains ambiguous private/not-found metadata with connected=%s', async signedIn => {
    if (signedIn) connected();
    request.mockImplementation(async () => new Response(null, { status: 404 }));
    await expect(checkHuggingFaceDatasetAccess(info, url => fetchDatasetResource(url)))
      .rejects.toThrow(signedIn ? 'repository permissions' : 'Sign in with Hugging Face');
  });

  it('forgets a rejected current token without exposing the provider response', async () => {
    connected();
    request.mockImplementation(async () => new Response('secret provider payload', { status: 401 }));
    await expect(fetchDatasetResource(info)).rejects.toThrow('connection expired');
    expect(hfAuth.expire).toHaveBeenCalledOnce();
  });

  it('does not expire a newer account when an old authorized response arrives', async () => {
    connected('old-session');
    request.mockImplementation(async (_url, init) => {
      if (!authorization(init)) return new Response(null, { status: 401 });
      connected('new-session');
      return new Response(null, { status: 401 });
    });
    await expect(fetchDatasetResource(info)).rejects.toThrow('connection expired');
    expect(hfAuth.expire).not.toHaveBeenCalled();
    expect(hfAuth.getReadAccessToken()).toBe('new-session');
  });

  it('reports denied repository/organization access without disconnecting the account', async () => {
    connected();
    request.mockImplementation(async () => new Response(null, { status: 403 }));
    await expect(fetchDatasetResource(info)).rejects.toThrow('organization permissions');
    expect(hfAuth.expire).not.toHaveBeenCalled();
  });

  it('keeps ordinary optional-file 404s after authenticated access', async () => {
    connected();
    request.mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(new Response('image'))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    await (await fetchDatasetResource(root + 'images/photo.jpg')).text();
    const response = await fetchDatasetResource(root + 'masks/photo.jpg.png');
    expect(response.status).toBe(404);
    await response.body?.cancel();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('does not retry authorization after cancellation', async () => {
    connected();
    const controller = new AbortController();
    request.mockImplementationOnce(async () => { controller.abort(); return new Response(null, { status: 401 }); });
    await expect(fetchDatasetResource(info, undefined, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).toHaveBeenCalledOnce();
    expect(hfAuth.getReadAccessToken).not.toHaveBeenCalled();
    expect(hfAuth.expire).not.toHaveBeenCalled();
  });

  it('keeps inactivity timeout and body cancellation after the authorization retry', async () => {
    vi.useFakeTimers();
    connected();
    const cancel = vi.fn();
    request.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel })));
    const response = await fetchDatasetResource(info, 100);
    const body = expect(response.text()).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(100);
    await body;
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['zip', 'tar'])('downloads private %s archives through the same authenticated path', async extension => {
    vi.stubGlobal('Blob', NodeBlob);
    connected();
    request.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response('archive', { headers: { 'content-length': '7' } }));
    const progress = vi.fn();
    const blob = await downloadZip(root + `scene.${extension}`, progress);
    expect(await blob.text()).toBe('archive');
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ bytesLoaded: 7, bytesTotal: 7 }));
    expect(authorization(request.mock.calls[1][1])).toBe('Bearer test-private-access');
  });

  it('authenticates lazy image, mask and frustum texture requests', async () => {
    connected();
    request.mockImplementation(async (_url, init) => new Response(authorization(init) ? 'media' : null,
      { status: authorization(init) ? 200 : 401 }));
    const options = { signal: new AbortController().signal, getPriority: () => 'foreground' as const };
    const scheduler = new UrlMediaScheduler();
    expect(await scheduler.transfer(root + 'images/photo.png', options)).toMatchObject({ kind: 'success' });
    expect(await scheduler.transfer(root + 'masks/photo.png', options)).toMatchObject({ kind: 'success' });
    const bitmap = { width: 4, height: 3 } as ImageBitmap;
    expect(await getOrLoadFrustumBitmap(root + 'images/other.png', 'other.png', new Map(),
      { createBitmap: vi.fn(async () => bitmap) })).toBe(bitmap);
    expect(request.mock.calls.slice(1).every(([, init]) => authorization(init) === 'Bearer test-private-access')).toBe(true);
  });
});
