import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bucketConnection } from '../../features/bucketStorage/connection';
import { useBucketStorageStoreFacade } from './useBucketStorageStoreFacade';

beforeEach(() => { bucketConnection.disconnect(); });
afterEach(() => { cleanup(); bucketConnection.disconnect(); });
describe('bucket storage facade', () => {
  it('tracks connect and disconnect through the redacted external snapshot', () => {
    const { result } = renderHook(useBucketStorageStoreFacade);
    act(() => bucketConnection.connect({ baseUrl: 'https://s3.example/b/', region: 'auto' }, { accessKeyId: 'fixture-key', secretAccessKey: 'fixture-secret' }));
    expect(result.current.connection.canWrite).toBe(true);
    expect(JSON.stringify(result.current.connection)).not.toContain('fixture-secret');
    act(() => bucketConnection.disconnect());
    expect(result.current.connection.config).toBeNull();
  });
});
