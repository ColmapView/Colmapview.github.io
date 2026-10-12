import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canRecoverStorageAccess, assertStorageReadAccess, recordStorageAccessFailure } from './storageAccess';

beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true'); vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', '');
  vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '12345-fixture.apps.googleusercontent.com');
  vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'fixture-api-key'); vi.stubEnv('VITE_GOOGLE_DRIVE_APP_ID', '12345');
});
afterEach(() => vi.unstubAllEnvs());
describe('storage access recovery policy', () => {
  it('offers Drive recovery only when this host and every Picker credential permit it', () => {
    expect(canRecoverStorageAccess({ provider: 'google' })).toBe(true);
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'false');
    expect(canRecoverStorageAccess({ provider: 'google' })).toBe(false);
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
    vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', 'https://colmapview.opsiclear.com');
    expect(canRecoverStorageAccess({ provider: 'google' })).toBe(false);
    vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', ''); vi.stubEnv('VITE_GOOGLE_DRIVE_APP_ID', '');
    expect(canRecoverStorageAccess({ provider: 'google' })).toBe(false);
  });
  it('preserves connected custom bucket context only for required reads', () => {
    const response = new Response(null, { status: 403 });
    const bucketUrl = 'https://minio.example/my-bucket/';
    recordStorageAccessFailure(response, { provider: 'bucket', bucketUrl });
    expect(response.status).toBe(403);
    expect(() => assertStorageReadAccess(response, bucketUrl + 'manifest.json')).toThrow(expect.objectContaining({
      type: 'auth', access: { provider: 'bucket', bucketUrl },
    }));
  });
  it('does not reinterpret server failures or expired presigned URLs as a bucket login', () => {
    const url = 'https://bucket.s3.amazonaws.com/scene.zip';
    expect(() => assertStorageReadAccess(new Response(null, { status: 500 }), url)).not.toThrow();
    expect(() => assertStorageReadAccess(new Response(null, { status: 403 }), url + '?X-Amz-Signature=fixture')).not.toThrow();
  });
});
