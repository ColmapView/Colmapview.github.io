import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeletionStore, useReconstructionStore } from '../../store';
import { applyDeletionsToData } from '../../store/actions/deletionActions';
import { buildReconstruction } from '../../test/builders';
import { useGoogleDrivePublishStoreFacade } from './useGoogleDrivePublishStoreFacade';

const external = vi.hoisted(() => ({
  auth: { status: 'disconnected', error: null } as { status: string; error: string | null },
  publish: { phase: 'idle' },
  authListeners: new Set<() => void>(),
  publishListeners: new Set<() => void>(),
  publishDataset: vi.fn(),
}));
vi.mock('../../features/googleDrive/auth', () => ({ googleDrivePublishAuth: {
  getSnapshot: () => external.auth,
  subscribe: (listener: () => void) => { external.authListeners.add(listener); return () => external.authListeners.delete(listener); },
} }));
vi.mock('../../features/googleDrive/publicationRuntime', () => ({
  publishCurrentDatasetToDrive: external.publishDataset,
  drivePublication: {
    getSnapshot: () => external.publish,
    subscribe: (listener: () => void) => { external.publishListeners.add(listener); return () => external.publishListeners.delete(listener); },
  },
}));

beforeEach(() => {
  useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  useDeletionStore.setState(useDeletionStore.getInitialState(), true);
  external.auth = { status: 'disconnected', error: null };
  external.publish = { phase: 'idle' };
});
afterEach(() => { cleanup(); useReconstructionStore.getState().clear(); });

describe('Google Drive publish store facade', () => {
  it('tracks the current scene and pending edits while exposing the explicit publication actions', () => {
    const { result } = renderHook(useGoogleDrivePublishStoreFacade);
    const reconstruction = buildReconstruction();
    act(() => {
      useReconstructionStore.setState({ reconstruction });
      useDeletionStore.setState({ pendingDeletions: new Set([1, 2]) });
    });
    expect(result.current.reconstruction).toBe(reconstruction);
    expect(result.current.pendingDeletions).toBe(2);
    expect(result.current.applyDeletionsToData).toBe(applyDeletionsToData);
    expect(result.current.publishDataset).toBe(external.publishDataset);
    expect(external.publishDataset).not.toHaveBeenCalled();
  });

  it('updates account and upload state and removes subscriptions when the dialog closes', () => {
    const { result, unmount } = renderHook(useGoogleDrivePublishStoreFacade);
    act(() => {
      external.auth = { status: 'connected', error: null };
      external.publish = { phase: 'uploading' };
      external.authListeners.forEach(listener => listener());
      external.publishListeners.forEach(listener => listener());
    });
    expect(result.current.auth.status).toBe('connected');
    expect(result.current.publish.phase).toBe('uploading');
    unmount();
    expect(external.authListeners.size).toBe(0);
    expect(external.publishListeners.size).toBe(0);
  });
});
