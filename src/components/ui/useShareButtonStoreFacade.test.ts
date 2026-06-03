import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useCameraStore,
  useReconstructionStore,
  useUIStore,
} from '../../store';
import type { CameraViewState } from '../../store/types';
import {
  buildReconstruction,
} from '../../test/builders';
import type { ColmapManifest } from '../../types/manifest';
import { useShareButtonStoreFacade } from './useShareButtonStoreFacade';

const manifest: ColmapManifest = {
  version: 1,
  baseUrl: 'https://example.test/data/',
  files: {
    cameras: 'cameras.bin',
    images: 'images.bin',
    points3D: 'points3D.bin',
  },
};

const viewState: CameraViewState = {
  position: [1, 2, 3],
  quaternion: [0, 0, 0, 1],
  target: [4, 5, 6],
  distance: 7,
};

describe('useShareButtonStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects share-button dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({
      sourceType: 'manifest',
      sourceUrl: 'https://example.test/manifest.json',
      sourceManifest: manifest,
      reconstruction,
    });
    useCameraStore.setState({ currentViewState: viewState });
    useUIStore.setState({ embedMode: true });

    const { result } = renderHook(() => useShareButtonStoreFacade());

    expect(result.current.data).toEqual({
      sourceType: 'manifest',
      sourceUrl: 'https://example.test/manifest.json',
      sourceManifest: manifest,
      reconstruction,
      currentViewState: viewState,
      embedMode: true,
    });
  });
});
