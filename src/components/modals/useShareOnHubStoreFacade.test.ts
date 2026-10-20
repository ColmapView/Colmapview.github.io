import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useCameraStore, useDeletionStore, useExportStore, useReconstructionStore } from '../../store';
import { buildReconstruction } from '../../test/builders';
import { useShareOnHubStoreFacade } from './useShareOnHubStoreFacade';
import type { CameraViewState } from '../../store/types';

beforeEach(() => {
  useReconstructionStore.setState({ ...useReconstructionStore.getInitialState(), reconstruction: buildReconstruction(),
    sourceType: 'url', sourceUrl: 'https://datasets.example/scene/', sourceName: 'Scene' }, true);
  useDeletionStore.setState(useDeletionStore.getInitialState(), true);
  useExportStore.setState(useExportStore.getInitialState(), true);
  useCameraStore.setState(useCameraStore.getInitialState(), true);
});

it('tracks source, edits and pending deletions without an unstable store selector', () => {
  const { result } = renderHook(useShareOnHubStoreFacade);
  const original = result.current.source.key;
  expect(result.current.sourceName).toBe('Scene');
  act(() => {
    useReconstructionStore.setState({ sourceUrl: 'https://datasets.example/other/', reconstructionEditRevision: 2 });
    useDeletionStore.setState({ pendingDeletions: new Set([1]) });
  });
  expect(result.current.source.key).not.toBe(original);
  expect(result.current.source.revision).toBe(2); expect(result.current.pending).toBe(1);
});

it('subscribes to preview capture and reads the current camera view at submission time', () => {
  const { result } = renderHook(useShareOnHubStoreFacade);
  const capture = vi.fn(async () => null);
  act(() => useExportStore.setState({ getScreenshotBlob: capture }));
  expect(result.current.getScreenshot).toBe(capture);
  const readView = result.current.getCurrentView;
  const view: CameraViewState = { position: [1, 2, 3], quaternion: [1, 0, 0, 0], target: [0, 0, 0], distance: 4 };
  act(() => useCameraStore.setState({ currentViewState: view }));
  expect(readView()).toBe(view);
});
