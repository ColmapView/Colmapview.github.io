import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeletionStore, useReconstructionStore, useExportStore } from '../../store';
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
vi.mock('../../features/googleDrive/auth', () => ({ googleDriveAuth: {
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
  useExportStore.setState(useExportStore.getInitialState(), true);
  external.auth = { status: 'disconnected', error: null };
  external.publish = { phase: 'idle' };
});
afterEach(() => { cleanup(); useReconstructionStore.getState().clear(); useExportStore.setState(useExportStore.getInitialState(), true); });

describe('Google Drive publish store facade', () => {
  it('updates preview source and capture callback when the scene or renderer changes', () => {
    const capture = vi.fn<() => Promise<Blob | null>>().mockResolvedValue(null);
    const replacementCapture = vi.fn<() => Promise<Blob | null>>().mockResolvedValue(null);
    const { result } = renderHook(useGoogleDrivePublishStoreFacade);
    expect(result.current.sourceKey).toBe('');
    expect(result.current.getScreenshotBlob).toBeNull();
    act(() => {
      useReconstructionStore.setState({ reconstruction: buildReconstruction() });
      useExportStore.setState({ getScreenshotBlob: capture });
    });
    const firstSource = result.current.sourceKey;
    expect(firstSource).not.toBe('');
    expect(result.current.getScreenshotBlob).toBe(capture);
    act(() => {
      useReconstructionStore.setState({ reconstruction: buildReconstruction() });
      useExportStore.setState({ getScreenshotBlob: replacementCapture });
    });
    expect(result.current.sourceKey).not.toBe(firstSource);
    expect(result.current.getScreenshotBlob).toBe(replacementCapture);
    expect(capture).not.toHaveBeenCalled();
    expect(replacementCapture).not.toHaveBeenCalled();
  });
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
