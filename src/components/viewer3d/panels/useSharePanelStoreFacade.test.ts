import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCameraStore,
  useExportStore,
  useNotificationStore,
  useReconstructionStore,
  usePublicationStatusStore,
  useDrivePublicationStatus,
} from '../../../store';
import type { CameraViewState } from '../../../store/types';
import { buildReconstruction } from '../../../test/builders';
import type { ColmapManifest } from '../../../types/manifest';
import { useSharePanelStoreFacade } from './useSharePanelStoreFacade';

const manifest: ColmapManifest = {
  version: 1,
  baseUrl: 'https://example.com/dataset/',
  files: {
    cameras: 'sparse/cameras.bin',
    images: 'sparse/images.bin',
    points3D: 'sparse/points3D.bin',
  },
};

const viewState: CameraViewState = {
  position: [1, 2, 3],
  quaternion: [1, 0, 0, 0],
  target: [0, 0, 0],
  distance: 4,
};

describe('useSharePanelStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    useExportStore.setState(useExportStore.getInitialState(), true);
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    usePublicationStatusStore.setState({ phase: 'idle' });
    useDrivePublicationStatus.setState({ active: false });
  });

  it('collects share data dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();
    const getScreenshotBlob = vi.fn().mockResolvedValue(new Blob(['screenshot']));
    useReconstructionStore.setState({
      reconstruction,
      sourceUrl: 'https://example.com/manifest.json',
      sourceManifest: manifest,
    });
    useCameraStore.setState({ currentViewState: viewState });
    useExportStore.setState({ getScreenshotBlob });

    const { result } = renderHook(() => useSharePanelStoreFacade());

    expect(result.current.data).toMatchObject({
      reconstruction,
      sourceUrl: 'https://example.com/manifest.json',
      sourceManifest: manifest,
      currentViewState: viewState,
      getScreenshotBlob,
    });
  });

  it('routes notifications through the notification store', () => {
    const { result } = renderHook(() => useSharePanelStoreFacade());

    act(() => {
      result.current.addNotification('info', 'Share copied', 4000);
    });

    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      type: 'info',
      message: 'Share copied',
      duration: 4000,
    });
  });

  it('keeps Share active while either publisher has a pending publication', () => {
    const { result } = renderHook(() => useSharePanelStoreFacade());
    expect(result.current.data.publicationActive).toBe(false);
    act(() => usePublicationStatusStore.setState({ phase: 'uploading' }));
    expect(result.current.data.publicationActive).toBe(true);
    act(() => {
      usePublicationStatusStore.setState({ phase: 'idle' });
      useDrivePublicationStatus.setState({ active: true });
    });
    expect(result.current.data.publicationActive).toBe(true);
    act(() => useDrivePublicationStatus.setState({ active: false }));
    expect(result.current.data.publicationActive).toBe(false);
  });
});
