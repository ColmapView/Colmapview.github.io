import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeletionStore, useReconstructionStore, useExportStore } from '../../store';
import { applyDeletionsToData } from '../../store/actions/deletionActions';
import { buildReconstruction } from '../../test/builders';
import { usePublishDatasetStoreFacade } from './usePublishDatasetStoreFacade';

const external = vi.hoisted(() => ({
  auth: { status: 'disconnected', identity: null } as { status: string; identity: { username: string } | null },
  publish: { phase: 'idle' },
  authListeners: new Set<() => void>(),
  publicationListeners: new Set<() => void>(),
  publishDataset: vi.fn(),
}));
vi.mock('../../features/huggingface/auth', () => ({ hfAuth: {
  getSnapshot: () => external.auth,
  subscribe: (listener: () => void) => { external.authListeners.add(listener); return () => external.authListeners.delete(listener); },
} }));
vi.mock('../../features/datasetPublishing/publicationRuntime', () => ({
  getPublicationSourceKey: () => 'captured-source',
  publishCurrentDataset: external.publishDataset,
  publication: {
    getSnapshot: () => external.publish,
    subscribe: (listener: () => void) => { external.publicationListeners.add(listener); return () => external.publicationListeners.delete(listener); },
  },
}));

beforeEach(() => {
  useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  useDeletionStore.setState(useDeletionStore.getInitialState(), true);
  useExportStore.setState(useExportStore.getInitialState(), true);
  external.auth = { status: 'disconnected', identity: null };
  external.publish = { phase: 'idle' };
});

describe('usePublishDatasetStoreFacade', () => {
  it('subscribes to the current viewer screenshot callback', () => {
    const { result } = renderHook(usePublishDatasetStoreFacade);
    expect(result.current.getScreenshotBlob).toBeNull();
    const capture = vi.fn().mockResolvedValue(null);
    act(() => useExportStore.getState().setGetScreenshotBlob(capture));
    expect(result.current.getScreenshotBlob).toBe(capture);
    act(() => useExportStore.getState().setGetScreenshotBlob(null));
    expect(result.current.getScreenshotBlob).toBeNull();
  });

  it('exposes the current model and explicit deletion action without changing data', () => {
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({ reconstruction });
    useDeletionStore.setState({ pendingDeletions: new Set([1, 2]) });
    const { result } = renderHook(usePublishDatasetStoreFacade);
    expect(result.current.reconstruction).toBe(reconstruction);
    expect(result.current.pendingDeletions).toBe(2);
    expect(result.current.applyDeletionsToData).toBe(applyDeletionsToData);
    expect(result.current.publishDataset).toBe(external.publishDataset);
    expect(result.current.sourceKey).toBe('captured-source');
  });

  it('subscribes to connection and publication changes and unsubscribes on close', () => {
    const { result, unmount } = renderHook(usePublishDatasetStoreFacade);
    act(() => {
      external.auth = { status: 'connected', identity: { username: 'publisher' } };
      external.publish = { phase: 'uploading' };
      external.authListeners.forEach(listener => listener());
      external.publicationListeners.forEach(listener => listener());
    });
    expect(result.current.auth.identity?.username).toBe('publisher');
    expect(result.current.publish.phase).toBe('uploading');
    unmount();
    expect(external.authListeners.size).toBe(0);
    expect(external.publicationListeners.size).toBe(0);
  });
});
