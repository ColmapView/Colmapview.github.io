import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReconstructionStore, useDeletionStore } from '../../store';
import { buildCamera, buildReconstruction } from '../../test/builders';
import { bucketConnection } from '../../features/bucketStorage/connection';
import { useBucketStorageStoreFacade } from './useBucketStorageStoreFacade';

vi.mock('../../features/bucketStorage/publicationRuntime', () => ({ bucketPublication: {
  subscribe: () => () => {}, getSnapshot: () => state,
}, publishCurrentDatasetToBucket: vi.fn() }));
const state = { phase: 'idle' };
beforeEach(() => {
  useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  useDeletionStore.setState(useDeletionStore.getInitialState(), true);
});
afterEach(() => { cleanup(); bucketConnection.disconnect(); useReconstructionStore.getState().clear(); });
describe('bucket storage facade', () => {
  it('allows publication only for a loaded COLMAP scene without pending deletions', () => {
    const { result } = renderHook(useBucketStorageStoreFacade);
    expect(result.current.canPublish).toBe(false);
    act(() => useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }) }));
    expect(result.current.canPublish).toBe(true);
    act(() => useDeletionStore.setState({ pendingDeletions: new Set([1]) }));
    expect(result.current.canPublish).toBe(false);
    expect(result.current.pendingDeletions).toBe(1);
  });
  it('tracks connect and disconnect through the redacted external snapshot', () => {
    const { result } = renderHook(useBucketStorageStoreFacade);
    act(() => bucketConnection.connect({ baseUrl: 'https://s3.example/b/', region: 'auto' }, { accessKeyId: 'fixture-key', secretAccessKey: 'fixture-secret' }));
    expect(result.current.connection.canWrite).toBe(true);
    expect(JSON.stringify(result.current.connection)).not.toContain('fixture-secret');
    act(() => bucketConnection.disconnect());
    expect(result.current.connection.config).toBeNull();
  });
});
