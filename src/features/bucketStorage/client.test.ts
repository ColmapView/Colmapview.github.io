import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listBucketPage } from './client';
import { createBucketConnection } from './connection';

const root = 'https://s3.example/bucket/';
const signal = () => new AbortController().signal;
beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => vi.unstubAllGlobals());
describe('bucket listing', () => {
  it('parses encoded keys and folder prefixes and carries opaque pagination tokens', async () => {
    const request = vi.fn().mockResolvedValue(new Response('<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><EncodingType>url</EncodingType><Contents><Key>folder%2Fa%20%2B%25%23.zip</Key><Size>4294967296</Size></Contents><CommonPrefixes><Prefix>folder%2Fnested%2F</Prefix></CommonPrefixes><IsTruncated>true</IsTruncated><NextContinuationToken>opaque/+&amp;=</NextContinuationToken></ListBucketResult>'));
    const session = createBucketConnection(request).connect({ baseUrl: root, region: 'auto' });
    const page = await listBucketPage(session, 'folder/', signal(), { token: 'previous+/=' });
    expect(page).toEqual({ objects: [{ key: 'folder/a +%#.zip', size: 4294967296 }], directories: ['folder/nested/'], nextToken: 'opaque/+&=' });
    const url = new URL(request.mock.calls[0][0]);
    expect(url.searchParams.get('prefix')).toBe('folder/');
    expect(url.searchParams.get('delimiter')).toBe('/');
    expect(url.searchParams.get('continuation-token')).toBe('previous+/=');
  });
  it('can read listings that ignore encoding-type and omits delimiter for recursive discovery', async () => {
    const request = vi.fn().mockResolvedValue(new Response('<ListBucketResult><Contents><Key>100% +.tar</Key><Size>0</Size></Contents><IsTruncated>false</IsTruncated></ListBucketResult>'));
    const session = createBucketConnection(request).connect({ baseUrl: root, region: 'auto' });
    const page = await listBucketPage(session, '', signal(), { recursive: true });
    expect(page.objects[0].key).toBe('100% +.tar');
    expect(new URL(request.mock.calls[0][0]).searchParams.has('delimiter')).toBe(false);
  });
  it.each([
    '<Error><Message>private-secret</Message></Error>',
    '<ListBucketResult>',
    '<ListBucketResult><Contents><Key>elsewhere/x</Key><Size>1</Size></Contents></ListBucketResult>',
    '<ListBucketResult><Contents><Key>folder/x</Key><Size>-1</Size></Contents></ListBucketResult>',
    '<ListBucketResult><Contents><Key>folder/x</Key><Size>9007199254740992</Size></Contents></ListBucketResult>',
    '<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>',
  ])('rejects malformed, incomplete, or escaped listings', async xml => {
    const session = createBucketConnection(async () => new Response(xml)).connect({ baseUrl: root, region: 'auto' });
    await expect(listBucketPage(session, 'folder/', signal())).rejects.toThrow();
  });
  it('reports access denial without echoing remote XML errors', async () => {
    const session = createBucketConnection(async () => new Response('<Error>private-secret</Error>', { status: 403 })).connect({ baseUrl: root, region: 'auto' });
    await expect(listBucketPage(session, '', signal())).rejects.toThrow('public object URL');
    await expect(listBucketPage(session, '', signal())).rejects.not.toThrow('private-secret');
  });
});
