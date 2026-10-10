import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBucketConnection } from './connection';
import { uploadBucketObject } from './upload';

const config = { baseUrl: 'https://s3.example/bucket/', region: 'us-east-1' };
const credentials = { accessKeyId: 'fixture-key', secretAccessKey: 'fixture-secret' };
const largeBytes = new Uint8Array(32 * 1024 * 1024 + 1);
const signal = () => new AbortController().signal;
const initiation = () => new Response('<InitiateMultipartUploadResult><UploadId>opaque/+=id</UploadId></InitiateMultipartUploadResult>');
beforeEach(() => { vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('crypto', webcrypto); });
afterEach(() => vi.unstubAllGlobals());

describe('bucket object uploads', () => {
  it('uploads a small native Blob directly with its type and exact bytes', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null));
    const connection = createBucketConnection(request);
    const session = connection.connect(config, credentials);
    const blob = new Blob(['original bytes'], { type: 'image/png' });
    const progress = vi.fn();
    await uploadBucketObject(session, 'images/photo +#.png', blob, signal(), progress);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toBe(config.baseUrl + 'images/photo%20%2B%23.png');
    expect(request.mock.calls[0][1].body).toBe(blob);
    expect(new Headers(request.mock.calls[0][1].headers).get('Content-Type')).toBe('image/png');
    expect(progress).toHaveBeenCalledWith(blob.size);
    connection.disconnect();
  });
  it('slices a large object into bounded parts and sends ordered, XML-escaped ETags', async () => {
    const request = vi.fn(async (url: string, init: RequestInit) => {
      const parsed = new URL(url);
      if (parsed.searchParams.has('uploads')) return initiation();
      if (init.method === 'PUT') return new Response(null, { headers: { ETag: '"part&' + parsed.searchParams.get('partNumber') + '"' } });
      return new Response('<CompleteMultipartUploadResult><ETag>complete</ETag></CompleteMultipartUploadResult>');
    });
    const connection = createBucketConnection(request);
    const progress = vi.fn();
    await uploadBucketObject(connection.connect(config, credentials), 'splats/large.sog', new Blob([largeBytes]), signal(), progress);
    const calls = request.mock.calls;
    expect(calls.map(([, init]) => init.method)).toEqual(['POST', 'PUT', 'PUT', 'PUT', 'POST']);
    expect(calls.filter(([, init]) => init.method === 'PUT').map(([, init]) => (init.body as Blob).size)).toEqual([16 * 1024 * 1024, 16 * 1024 * 1024, 1]);
    expect(calls.slice(1).every(([url]) => new URL(url).searchParams.get('uploadId') === 'opaque/+=id')).toBe(true);
    const completed = new DOMParser().parseFromString(calls.at(-1)![1].body as string, 'application/xml');
    expect([...completed.querySelectorAll('PartNumber')].map(element => element.textContent)).toEqual(['1', '2', '3']);
    expect(completed.querySelector('ETag')?.textContent).toBe('"part&1"');
    expect(progress.mock.calls.map(([bytes]) => bytes)).toEqual([16 * 1024 * 1024, 32 * 1024 * 1024, largeBytes.length]);
    connection.disconnect();
  });
  it.each(['caller', 'disconnect'])('aborts multipart state on %s cancellation without using the cancelled signal for cleanup', async cancel => {
    const controller = new AbortController();
    let cleaned = false;
    const connection = createBucketConnection(async (url, init) => {
      if (new URL(url).searchParams.has('uploads')) return initiation();
      if (init.method === 'PUT') {
        if (cancel === 'caller') controller.abort(); else connection.disconnect();
        return new Response(null, { headers: { ETag: '"part"' } });
      }
      expect(init.method).toBe('DELETE');
      expect(init.signal?.aborted).toBe(false);
      expect(new URL(url).searchParams.get('uploadId')).toBe('opaque/+=id');
      cleaned = true;
      return new Response(null, { status: 204 });
    });
    const session = connection.connect(config, credentials);
    await expect(uploadBucketObject(session, 'large.tar', new Blob([largeBytes]), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(cleaned).toBe(true);
    connection.disconnect();
  });
  it.each(['etag', 'completion'])('cleans up after a missing %s confirmation', async failure => {
    const methods: string[] = [];
    const connection = createBucketConnection(async (url, init) => {
      methods.push(init.method!);
      if (new URL(url).searchParams.has('uploads')) return initiation();
      if (init.method === 'PUT') return new Response(null, { headers: failure === 'etag' ? {} : { ETag: '"part"' } });
      if (init.method === 'DELETE') return new Response(null, { status: 204 });
      return new Response('<Error><Code>InternalError</Code><Message>remote-secret</Message></Error>');
    });
    await expect(uploadBucketObject(connection.connect(config, credentials), 'large.zip', new Blob([largeBytes]), signal()))
      .rejects.toThrow(failure === 'etag' ? 'expose ETag' : 'invalid metadata');
    expect(methods.at(-1)).toBe('DELETE');
    connection.disconnect();
  });
  it('never starts an upload with anonymous access or an already-aborted signal', async () => {
    const request = vi.fn();
    const connection = createBucketConnection(request);
    const publicSession = connection.connect(config);
    await expect(uploadBucketObject(publicSession, 'small.zip', new Blob(['zip']), signal())).rejects.toThrow('access key');
    const controller = new AbortController(); controller.abort();
    await expect(uploadBucketObject(connection.connect(config, credentials), 'small.zip', new Blob(['zip']), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
    connection.disconnect();
  });
});
