import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  useCameraStore,
  useNotificationStore,
  useReconstructionStore,
  useDeletionStore,
  usePublicationStatusStore,
  useDrivePublicationStatus,
} from '../../../store';
import type { CameraViewState } from '../../../store/types';
import type { LoadedFiles, SplatFileSource } from '../../../types/colmap';
import { buildReconstruction } from '../../../test/builders';
import type { ColmapManifest } from '../../../types/manifest';
import { useSharePanelStoreFacade } from './useSharePanelStoreFacade';
import { hubShareLinks } from '../../../features/colmapviewHub/hubShareLinks';
import { getHubSourceKey, getPublicationSourceKey } from '../../../features/datasetPublishing/publicationSnapshot';

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
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    usePublicationStatusStore.setState({ phase: 'idle' });
    useDrivePublicationStatus.setState({ active: false });
  });

  it('collects share data dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({
      reconstruction,
      sourceUrl: 'https://example.com/manifest.json',
      sourceManifest: manifest,
    });
    useCameraStore.setState({ currentViewState: viewState });

    const { result } = renderHook(() => useSharePanelStoreFacade());

    expect(result.current.data).toMatchObject({
      reconstruction,
      sourceUrl: 'https://example.com/manifest.json',
      sourceManifest: manifest,
      currentViewState: viewState,
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

const splatFiles = (splatFile: File, splatFileSources: SplatFileSource[]): LoadedFiles => ({ imageFiles: new Map(), hasMasks: false, splatFile, splatFileSources });

describe('Hub link for the Share panel', () => {
  // The stores and the Hub link registry are module singletons; leave them as the next test expects.
  afterEach(() => {
    hubShareLinks.set('huggingFace', null);
    hubShareLinks.set('googleDrive', null);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
  });

  it('offers the Hub link made from this dataset state, and none after an edit or with pending deletions', () => {
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceType: 'url', sourceUrl: 'https://example.test/a/', reconstructionEditRevision: 0 });
    hubShareLinks.set('huggingFace', { url: 'https://hub.invalid/hub/HappyTree', source: { key: getHubSourceKey(), revision: 0 }, readyAt: 1 });
    const { result } = renderHook(() => useSharePanelStoreFacade());
    expect(result.current.data.hubLink).toBe('https://hub.invalid/hub/HappyTree');
    act(() => { useDeletionStore.setState({ pendingDeletions: new Set([1]) }); });
    expect(result.current.data.hubLink).toBeNull();
    act(() => { useDeletionStore.setState({ pendingDeletions: new Set() }); useReconstructionStore.setState({ reconstructionEditRevision: 1 }); });
    expect(result.current.data.hubLink).toBeNull();
  });

  it('stops offering the Hub link once another splat is chosen or a replacement is dropped under the same name', () => {
    const splatA = new File(['a'], 'scene.ply');
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceType: 'url', sourceUrl: 'https://example.test/a/', reconstructionEditRevision: 0,
      loadedFiles: splatFiles(splatA, [{ id: 'a', path: 'a.ply', file: splatA }]) });
    const publicationKey = getPublicationSourceKey();
    hubShareLinks.set('googleDrive', { url: 'https://hub.invalid/hub/HappyTree', source: { key: getHubSourceKey(), revision: 0 }, readyAt: 1 });
    const { result } = renderHook(() => useSharePanelStoreFacade());
    expect(result.current.data.hubLink).toBe('https://hub.invalid/hub/HappyTree');
    const splatB = new File(['b'], 'other.ply');
    act(() => { useReconstructionStore.setState({ loadedFiles: splatFiles(splatB, [{ id: 'a', path: 'a.ply', file: splatA }, { id: 'b', path: 'other.ply', file: splatB }]) }); });
    expect(result.current.data.hubLink).toBeNull();
    const replacement = new File(['c'], 'scene.ply');
    act(() => { useReconstructionStore.setState({ loadedFiles: splatFiles(replacement, [{ id: 'a', path: 'a.ply', file: replacement }]) }); });
    expect(result.current.data.hubLink).toBeNull();
    act(() => { useReconstructionStore.setState({ loadedFiles: splatFiles(splatA, [{ id: 'a', path: 'a.ply', file: splatA }]) }); });
    expect(result.current.data.hubLink).toBe('https://hub.invalid/hub/HappyTree');
    // The upload job itself is unaffected: the publication source key ignores the splat.
    expect(getPublicationSourceKey()).toBe(publicationKey);
  });

  it('keeps a remote splat matched by its source id when its bytes arrive', () => {
    const placeholder = new File([], 'remote.ply');
    const remote = { id: 'r', path: 'remote.ply', url: 'https://example.test/a/remote.ply' };
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceType: 'url', sourceUrl: 'https://example.test/a/', loadedFiles: splatFiles(placeholder, [remote]) });
    const key = getHubSourceKey();
    const downloaded = new File(['bytes'], 'remote.ply');
    useReconstructionStore.setState({ loadedFiles: splatFiles(downloaded, [{ ...remote, file: downloaded }]) });
    expect(getHubSourceKey()).toBe(key);
  });
});
