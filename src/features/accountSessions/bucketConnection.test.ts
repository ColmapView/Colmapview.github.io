import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBucketConnection } from '../bucketStorage/connection';
import { accountSessions, AccountSessionError } from './api';

const config = { baseUrl: 'https://s3.example/bucket/', region: 'auto' };
afterEach(() => { vi.restoreAllMocks(); });

describe('remembered bucket connection', () => {
  it('forgets a saved bucket even when this tab temporarily connected without remembering keys', () => {
    vi.spyOn(accountSessions, 'getSnapshot').mockReturnValue({ ready: true, capabilities: { google: false, hf: false, bucket: true },
      accounts: [], bucket: { config, writable: false }, expiresAt: Date.now() + 86400_000 });
    const forget = vi.spyOn(accountSessions, 'disconnect').mockResolvedValue();
    const connection = createBucketConnection();
    connection.connect({ baseUrl: 'https://another.example/bucket/', region: 'auto' });
    connection.disconnect(); expect(forget).toHaveBeenCalledWith('bucket');
  });

  it('reads using short-lived signed URLs and reuses them for range requests without receiving a key', async () => {
    const url = config.baseUrl + 'scene.zip';
    const signed = url + '?X-Amz-Signature=fixture';
    const sign = vi.spyOn(accountSessions, 'signBucket').mockResolvedValue({ url: signed, expiresAt: Date.now() + 100_000 });
    const forget = vi.spyOn(accountSessions, 'disconnect').mockResolvedValue();
    const fetch = vi.fn().mockResolvedValue(new Response('bytes'));
    const connection = createBucketConnection(fetch); const session = connection.connect(config, undefined, false);
    await session.request(url, { headers: { Range: 'bytes=0-8', Authorization: 'must-remove' } });
    await session.request(url, { headers: { Range: 'bytes=9-18' } });
    expect(sign).toHaveBeenCalledOnce(); expect(session.canWrite).toBe(false);
    expect(fetch).toHaveBeenCalledWith(signed, expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'no-store' }));
    expect(new Headers(fetch.mock.calls[0][1].headers).get('Authorization')).toBeNull();
    expect(new Headers(fetch.mock.calls[1][1].headers).get('Range')).toBe('bytes=9-18');
    await expect(session.request(url, { method: 'PUT', body: 'data' })).rejects.toThrow('access key');
    connection.disconnect(); expect(forget).toHaveBeenCalledWith('bucket');
    expect(session.signal.aborted).toBe(true);
  });

  it('signs multipart writes only after uploads were enabled and keeps auth failures actionable', async () => {
    const url = config.baseUrl + 'scene.zip?uploadId=fixture&partNumber=1';
    const sign = vi.spyOn(accountSessions, 'signBucket').mockResolvedValueOnce({ url: url + '&X-Amz-Signature=fixture', expiresAt: Date.now() + 100_000 })
      .mockRejectedValueOnce(new AccountSessionError('Reconnect this bucket to continue.', 401));
    vi.spyOn(accountSessions, 'disconnect').mockResolvedValue();
    const fetch = vi.fn().mockResolvedValue(new Response('done'));
    const connection = createBucketConnection(fetch); const session = connection.connect(config, undefined, true);
    await session.request(url, { method: 'PUT', body: 'part bytes' });
    expect(sign).toHaveBeenCalledWith(url, 'PUT', expect.any(AbortSignal));
    expect(fetch.mock.calls[0][1].body).toBe('part bytes');
    await expect(session.request(config.baseUrl + 'another.bin')).rejects.toThrow('Reconnect this bucket');
    expect(fetch).toHaveBeenCalledOnce(); connection.disconnect();
  });
});
