import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useCameraStore,
  useReconstructionStore,
} from '../../store';
import {
  buildCamera,
  buildFile,
  buildLoadedFiles,
  buildReconstruction,
} from '../../test/builders';
import { useFrustumPlaneStoreFacade } from './useFrustumPlaneStoreFacade';

describe('useFrustumPlaneStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useCameraStore.setState(useCameraStore.getInitialState(), true);
  });

  it('collects frustum plane camera and dataset dependencies', () => {
    const imageFile = buildFile('cam_1/00.png');
    const reconstruction = buildReconstruction({
      cameras: [
        buildCamera({ cameraId: 1 }),
        buildCamera({ cameraId: 2 }),
      ],
    });

    useReconstructionStore.setState({
      reconstruction,
      loadedFiles: buildLoadedFiles({ imageFiles: [imageFile] }),
      sourceType: 'local',
    });
    useCameraStore.setState({
      cameraFov: 55,
      cameraProjection: 'orthographic',
      selectionAnimationSpeed: 2,
      selectionColorMode: 'rainbow',
    });

    const { result } = renderHook(() => useFrustumPlaneStoreFacade());

    expect(result.current.data).toMatchObject({
      cameraFov: 55,
      cameraProjection: 'orthographic',
      multiCamera: true,
      selectionAnimationSpeed: 2,
      selectionColorMode: 'rainbow',
    });
    expect(result.current.data.dataset.getImageSync('cam_1/00.png')).toBe(imageFile);
  });

  it('routes FOV updates to the camera store', () => {
    const { result } = renderHook(() => useFrustumPlaneStoreFacade());

    act(() => {
      result.current.actions.setCameraFov(35);
    });

    expect(useCameraStore.getState().cameraFov).toBe(35);
  });
});
