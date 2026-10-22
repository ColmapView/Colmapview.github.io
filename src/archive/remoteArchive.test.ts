import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRemoteArchiveRead } from './remoteArchive';
import { hfAuth } from '../features/huggingface/auth';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const signal = () => new AbortController().signal;
const size = 6 * 1024 * 1024;
function server() {
  return vi.fn(async (_url: string, _timeout?: number, init?: RequestInit) => {
    const [start, end] = new Headers(init?.headers).get('range')!.match(/\d+/g)!.map(Number);
    const bytes = Uint8Array.from({ length: end - start + 1 }, (_, index) => (start + index) % 251);
    return new Response(bytes, { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${size}`, ETag: '"scene-v1"' } });
  });
}
describe('remote archive ranges', () => {
  it('bounds reads to a selected prefix while checking the original object size', async () => {
    const request = server();
    const read = createRemoteArchiveRead('https://example.test/frames.tar', size, request, 1024);
    expect(Array.from(new Uint8Array(await read(500, 20, signal())))).toEqual(Array.from({ length: 20 }, (_, index) => (index + 500) % 251));
    expect(new Headers(request.mock.calls[0][2]?.headers).get('Range')).toBe('bytes=0-1023');
    await expect(read(1020, 8, signal())).rejects.toThrow();
    expect(request).toHaveBeenCalledOnce();
    const changed = createRemoteArchiveRead('https://example.test/frames.tar', size,
      async () => new Response(new Uint8Array(1024), { status: 206, headers: { 'Content-Range': 'bytes 0-1023/1024' } }), 1024);
    await expect(changed(0, 20, signal())).rejects.toMatchObject({ name: 'ArchiveChangedError' });
  });

  it('cancels the body when storage access fails before range validation',async()=>{
    const cancel=vi.fn();
    const read=createRemoteArchiveRead('https://huggingface.co/datasets/owner/private/resolve/main/scene.zip',size,
      vi.fn(async()=>new Response(new ReadableStream({cancel}),{status:401})));
    await expect(read(0,30,signal())).rejects.toThrow();expect(cancel).toHaveBeenCalledOnce();
  });
  it('preserves offsets beyond 4 GiB without downloading the whole object', async () => {
    const total = 13_721_139_139;
    const request = vi.fn(async (_url: string, _timeout?: number, init?: RequestInit) => {
      const [start, end] = new Headers(init?.headers).get('range')!.match(/\d+/g)!.map(Number);
      expect(start).toBeGreaterThan(2 ** 32); expect(end - start).toBeLessThan(65536);
      return new Response(new Uint8Array(end-start+1).fill(17), { status:206, headers:{'content-range':`bytes ${start}-${end}/${total}`} });
    });
    const read = createRemoteArchiveRead('https://example.test/large.zip', total, request);
    expect(new Uint8Array(await read(total-30, 30, signal()))).toEqual(new Uint8Array(30).fill(17));
    expect(request).toHaveBeenCalledOnce();
  });
  it.each([[416, 'ArchiveRangeRejectedError', 'local file'], [404, 'ArchiveNotFoundError', 'pinned revision']] as const)('reports %s with a recovery route and cancels the body', async (status, name, message) => {
    const cancel = vi.fn();
    const read = createRemoteArchiveRead('https://example.test/broken.zip', size,
      vi.fn(async () => new Response(new ReadableStream({ cancel }), {status})));
    await expect(read(0,30,signal())).rejects.toMatchObject({name,message:expect.stringContaining(message)});
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('uses the signed-in Hugging Face request policy for private archive ranges', async () => {
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({ status: 'connected', identity: { username: 'owner' }, error: null });
    vi.spyOn(hfAuth, 'getReadAccessToken').mockReturnValue('reader-token');
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Range')).toBe('bytes=0-65535');
      if (!new Headers(init?.headers).has('Authorization')) return new Response(null, { status: 401 });
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer reader-token');
      return new Response(new Uint8Array(65536), { status: 206, headers: { 'content-range': `bytes 0-65535/${size}` } });
    });
    vi.stubGlobal('fetch', request);
    const read = createRemoteArchiveRead('https://huggingface.co/datasets/owner/private/resolve/main/scene.zip', size);
    expect((await read(0, 30, signal())).byteLength).toBe(30); expect(request).toHaveBeenCalledTimes(2);
  });
  it('reads exact bytes across blocks and reuses bounded ranges for small neighboring reads', async () => {
    const fetchImpl = server(), read = createRemoteArchiveRead('https://example.test/scene.tar', size, fetchImpl);
    expect(Array.from(new Uint8Array(await read(500, 20, signal())))).toEqual(Array.from({ length: 20 }, (_, index) => (index + 500) % 251));
    await read(1000, 512, signal()); expect(fetchImpl).toHaveBeenCalledOnce();
    const bytes = new Uint8Array(await read(65530, 100000, signal()));
    expect(bytes.every((value, index) => value === (index + 65530) % 251)).toBe(true);
    expect(fetchImpl.mock.calls.every(([, , init]) => { const [start, end] = new Headers(init?.headers).get('range')!.match(/\d+/g)!.map(Number); return end - start + 1 <= 1024 * 1024; })).toBe(true);
  });
  it('evicts old blocks instead of retaining an entire remote archive', async () => {
    const fetchImpl = server(), read = createRemoteArchiveRead('https://example.test/scene.zip', size, fetchImpl);
    for (let index = 0; index < 5; index++) await read(index * 1024 * 1024, 16384, signal());
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    await read(0, 16384, signal()); expect(fetchImpl).toHaveBeenCalledTimes(6);
  });
  it.each([200, 206])('cancels an unvalidated %s response so the loader can use a full download', async status => {
    const cancel = vi.fn(), body = new ReadableStream<Uint8Array>({ cancel });
    const read = createRemoteArchiveRead('https://example.test/scene.zip', size, vi.fn(async () => new Response(body, { status })));
    await expect(read(0, 30, signal())).rejects.toMatchObject({ name: 'ArchiveRangeUnsupportedError' });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each(['bytes 1-65536/6291456', 'bytes 0-65535/2'])('rejects a changed size or wrong range (%s)', async range => {
    const read = createRemoteArchiveRead('https://example.test/scene.tar', size, vi.fn(async () => new Response(new Uint8Array(65536), { status: 206, headers: { 'content-range': range } })));
    await expect(read(0, 30, signal())).rejects.toThrow('file changed');
  });
  it('rejects inconsistent validators instead of mixing versions of an archive', async () => {
    const fetchImpl = server();
    const read = createRemoteArchiveRead('https://example.test/scene.tar', size, fetchImpl);
    await read(0, 512, signal());
    const implementation = fetchImpl.getMockImplementation()!;
    fetchImpl.mockImplementation(async (...args) => { const response = await implementation(...args); response.headers.set('etag', '"scene-v2"'); return response; });
    await expect(read(1024 * 1024, 512, signal())).rejects.toThrow('changed while');
  });
  it.each([65535, 65537])('bounds a malformed body of %s bytes', async length => {
    const read = createRemoteArchiveRead('https://example.test/scene.zip', size, vi.fn(async () => new Response(new Uint8Array(length), { status: 206,
      headers: { 'content-range': `bytes 0-65535/${size}` } })));
    await expect(read(0, 30, signal())).rejects.toThrow(length < 65536 ? 'incomplete' : 'exceeds');
  });
  it('cancels a stalled response body promptly and avoids network activity for invalid ranges', async () => {
    const cancel = vi.fn(), body = new ReadableStream<Uint8Array>({ cancel });
    const fetchImpl = vi.fn(async () => new Response(body, { status: 206, headers: { 'content-range': `bytes 0-65535/${size}` } }));
    const read = createRemoteArchiveRead('https://example.test/scene.zip', size, fetchImpl), controller = new AbortController();
    const pending = read(0, 30, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(body.locked).toBe(true)); controller.abort(); await rejected;
    expect(cancel).toHaveBeenCalledOnce();
    await expect(read(size - 1, 10, signal())).rejects.toThrow('byte range'); expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
