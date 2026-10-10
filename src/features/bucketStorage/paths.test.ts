import { describe, expect, it } from 'vitest';
import { bucketFolder, bucketKeyFromUrl, bucketObjectUrl, inferBucketRegion, normalizeBucketRoot, validateBucketConfig } from './paths';

describe('bucket addressing', () => {
  it.each(['https://bucket.s3.eu-west-2.amazonaws.com', 'https://account.r2.cloudflarestorage.com/bucket', 'http://localhost:9000/bucket'])('normalizes a supported bucket root: %s', value => {
    expect(normalizeBucketRoot(value)).toBe(value + '/');
  });
  it.each(['http://remote.example/bucket', 'https://key:secret@example.com/bucket', 'https://example.com/bucket?secret=x', 'https://example.com/bucket#x', 's3://bucket', 'not a URL'])('rejects unsafe or ambiguous roots: %s', value => {
    expect(() => normalizeBucketRoot(value)).toThrow();
  });
  it.each([
    ['https://b.s3.us-west-2.amazonaws.com/', 'us-west-2'],
    ['https://s3.eu-central-1.amazonaws.com/b/', 'eu-central-1'],
    ['https://b.s3.dualstack.ap-south-1.amazonaws.com/', 'ap-south-1'],
    ['https://a.r2.cloudflarestorage.com/b/', 'auto'],
    ['http://localhost:9000/b/', 'us-east-1'],
  ])('infers the signing region for %s', (url, region) => { expect(inferBucketRegion(url)).toBe(region); });
  it('encodes exact object keys and constrains credentials to one origin and bucket', () => {
    const root = 'https://s3.example/bucket/';
    const key = "nested/a +#%?'ü.jpg";
    const url = bucketObjectUrl(root, key);
    expect(bucketKeyFromUrl(root, url)).toBe(key);
    expect(new URL(url).search).toBe('');
    expect(new URL(url).hash).toBe('');
    for (const outside of ['https://elsewhere.example/bucket/a', 'https://s3.example/bucket-other/a', 'https://s3.example/other/a', 'https://s3.example/bucket/%2e%2e/other', 'https://s3.example/bucket/a%2F..%2Fb']) {
      expect(bucketKeyFromUrl(root, outside)).toBeNull();
    }
  });
  it.each(['../x', 'a/./b', 'a\\b', 'a\nkey', 'ü'.repeat(513)])('refuses unsupported keys: %s', key => {
    expect(() => bucketObjectUrl('https://s3.example/b/', key)).toThrow();
  });
  it('validates independent public and private roots and destination paths', () => {
    const config = validateBucketConfig({ baseUrl: 'https://private.example/b', region: '', publicBaseUrl: 'https://public.example/' });
    expect(config).toEqual({ baseUrl: 'https://private.example/b/', region: 'us-east-1', publicBaseUrl: 'https://public.example/' });
    expect(Object.isFrozen(config)).toBe(true);
    expect(bucketFolder(' /datasets/scene/ ')).toBe('datasets/scene');
    expect(() => bucketFolder('/')).toThrow();
  });
});
