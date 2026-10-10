import { Blob as NodeBlob } from 'node:buffer';
import { createHash, createHmac, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bucketConnection, createBucketConnection, fetchBucketDatasetRequest } from './connection';
import { fetchDatasetResource } from '../../utils/fetchDatasetResource';
import { downloadRemoteFile } from '../datasetPublishing/downloadRemoteFile';

const config = { baseUrl: 'https://s3.example/my-bucket/', region: 'us-east-1' };
const credentials = { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' };
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('Blob', NodeBlob); });
afterEach(() => { bucketConnection.disconnect(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('tab-only bucket connection', () => {
  it('reads public objects without authorization or credentials', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('public'));
    const connection = createBucketConnection(fetch);
    const session = connection.connect(config);
    const response = await session.request(config.baseUrl + 'scene.tar', { headers: { Range: 'bytes=0-8' } });
    expect(await response.text()).toBe('public');
    expect(new Headers(fetch.mock.calls[0][1].headers).get('Authorization')).toBeNull();
    expect(fetch.mock.calls[0][1].credentials).toBe('omit');
    expect(session.canWrite).toBe(false);
    await expect(session.request(config.baseUrl + 'file', { method: 'PUT' })).rejects.toThrow('access key');
    connection.disconnect();
  });
  it('signs exact paths with SigV4 while leaving the URL and snapshot free of credentials', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
    const fetch = vi.fn().mockResolvedValue(new Response('private'));
    const connection = createBucketConnection(fetch);
    const session = connection.connect(config, credentials);
    const url = config.baseUrl + 'a%20b%2B%23%25.jpg';
    await session.request(url, { headers: { Range: 'bytes=1-3' } });
    const init = fetch.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(fetch.mock.calls[0][0]).toBe(url);
    expect(headers.get('Range')).toBe('bytes=1-3');
    const date = '20261009T120000Z';
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonical = ['GET', '/my-bucket/a%20b%2B%23%25.jpg', '', `host:s3.example\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:${date}\n`, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
    const hmac = (key: string | Buffer, value: string) => createHmac('sha256', key).update(value).digest();
    const key = hmac(hmac(hmac(hmac('AWS4fixture-secret', '20261009'), 'us-east-1'), 's3'), 'aws4_request');
    const signature = hmac(key, ['AWS4-HMAC-SHA256', date, '20261009/us-east-1/s3/aws4_request', createHash('sha256').update(canonical).digest('hex')].join('\n')).toString('hex');
    expect(headers.get('Authorization')).toBe(`AWS4-HMAC-SHA256 Credential=fixture-access/20261009/us-east-1/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`);
    expect(init.redirect).toBe('error');
    expect(init.cache).toBe('no-store');
    expect(JSON.stringify(connection.getSnapshot())).not.toMatch(/fixture-access|fixture-secret/);
    expect(JSON.stringify(session)).not.toMatch(/fixture-access|fixture-secret/);
    connection.disconnect();
  });
  it('supports temporary credentials in headers without signing a whole Blob in memory', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null));
    const connection = createBucketConnection(fetch);
    const session = connection.connect(config, { ...credentials, sessionToken: 'fixture-token' });
    const blob = new Blob(['native upload'], { type: 'image/jpeg' });
    const arrayBuffer = vi.spyOn(blob, 'arrayBuffer');
    await session.request(config.baseUrl + 'image.jpg', { method: 'PUT', body: blob });
    expect(fetch.mock.calls[0][1].body).toBe(blob);
    expect(new Headers(fetch.mock.calls[0][1].headers).get('x-amz-security-token')).toBe('fixture-token');
    expect(arrayBuffer).not.toHaveBeenCalled();
    connection.disconnect();
  });
  it('refuses to sign other origins, other buckets, and ambiguous key paths', async () => {
    const fetch = vi.fn();
    const connection = createBucketConnection(fetch);
    const session = connection.connect(config, credentials);
    for (const url of ['https://evil.example/x', 'https://s3.example/other/x', config.baseUrl + 'a%2F..%2Fx']) {
      await expect(session.request(url)).rejects.toThrow('outside');
    }
    expect(fetch).not.toHaveBeenCalled();
    connection.disconnect();
  });
  it('aborts old requests on reconnect and permits only bounded multipart cleanup after disconnect', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null));
    const connection = createBucketConnection(fetch);
    const old = connection.connect(config, credentials);
    connection.connect(config);
    expect(old.signal.aborted).toBe(true);
    await expect(old.request(config.baseUrl + 'x')).rejects.toMatchObject({ name: 'AbortError' });
    await old.abortMultipart('x', 'upload/id', new AbortController().signal);
    expect(fetch.mock.calls[0][1].method).toBe('DELETE');
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('uploadId')).toBe('upload/id');
    expect(new Headers(fetch.mock.calls[0][1].headers).has('Authorization')).toBe(true);
    connection.disconnect();
    expect(connection.getSession()).toBeNull();
    expect(connection.getSnapshot()).toEqual({ config: null, canWrite: false });
  });
  it('uses the shared request policy for private lazy media, ranged archives, and re-publication', async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response('bytes', { headers: { 'content-length': '5' } }));
    vi.stubGlobal('fetch', fetch);
    bucketConnection.connect(config, credentials);
    const response = await fetchDatasetResource(config.baseUrl + 'photo.jpg', undefined, { headers: { Range: 'bytes=0-4' } });
    expect(await response.text()).toBe('bytes');
    const blob = await downloadRemoteFile(config.baseUrl + 'photo.jpg', 'images/photo.jpg', new AbortController().signal);
    expect(await blob.text()).toBe('bytes');
    expect(fetch.mock.calls.every(([, init]) => new Headers(init.headers).has('Authorization'))).toBe(true);
    expect(fetchBucketDatasetRequest('https://another.example/file')).toBeNull();
    expect(fetchBucketDatasetRequest(config.baseUrl + 'x?X-Amz-Signature=already-signed')).toBeNull();
  });
  it('rejects half-entered credentials and hides remote exception messages', async () => {
    const connection = createBucketConnection(async () => { throw new Error('fixture-secret from remote request'); });
    expect(() => connection.connect(config, { accessKeyId: 'key', secretAccessKey: '' })).toThrow('both');
    const session = connection.connect(config, credentials);
    await expect(session.request(config.baseUrl + 'file')).rejects.toThrow('CORS');
    await expect(session.request(config.baseUrl + 'file')).rejects.not.toThrow('fixture-secret');
    connection.disconnect();
  });
});
