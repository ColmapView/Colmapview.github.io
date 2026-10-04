import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { useCameraStore, useReconstructionStore, useUIStore } from '../../store';
import { CameraModelId } from '../../types/colmap';
import { buildCamera, buildImage, buildPoint2D, buildPoint3D, buildReconstruction } from '../../test/builders';
import { computeImageStats } from '../../parsers/imageStats';
import { CameraMatches } from './CameraMatches';

vi.mock('@react-three/fiber', () => ({ useFrame: () => {} }));

beforeEach(() => {
  const reconstruction = buildReconstruction({
    cameras: [buildCamera(), buildCamera({ cameraId: 2, modelId: CameraModelId.EQUIRECTANGULAR })],
    images: [
      buildImage({ imageId: 1, cameraId: 1, points2D: [buildPoint2D({ point3DId: 1n })] }),
      buildImage({ imageId: 2, cameraId: 2, tvec: [2, 0, 0], points2D: [buildPoint2D({ point3DId: 1n })] }),
    ],
    points3D: [buildPoint3D({ track: [{ imageId: 1, point2DIdx: 0 }, { imageId: 2, point2DIdx: 0 }] })],
  });
  Object.assign(reconstruction, computeImageStats(reconstruction.images, reconstruction.points3D!));
  useReconstructionStore.setState({ reconstruction });
  useCameraStore.setState({ selectedImageId: 2, cameraDisplayMode: 'imageplane' });
  useUIStore.setState({ showMatches: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useReconstructionStore.setState({ reconstruction: null });
  useCameraStore.setState({ selectedImageId: null, cameraDisplayMode: 'frustum' });
  useUIStore.setState({ showMatches: false });
});

it('renders actual cross-family track connections for a selected panorama in every display mode', () => {
  const { result } = renderHook(CameraMatches);
  for (const mode of ['imageplane', 'frustum', 'arrow'] as const) {
    act(() => useCameraStore.getState().setCameraDisplayMode(mode));
    expect(result.current).not.toBeNull();
    const object = result.current!.props.object as LineSegments2;
    expect(object.geometry.getAttribute('instanceStart').getX(0)).toBe(-2);
    expect(object.geometry.getAttribute('instanceEnd').getX(0)).toBe(0);
  }
});

it('updates and releases connections when switching from a panorama to a regular image or hiding matches', () => {
  const { result } = renderHook(CameraMatches);
  const panoramaLines = result.current!.props.object as LineSegments2;
  const dispose = vi.spyOn(panoramaLines.geometry, 'dispose');
  act(() => useCameraStore.getState().setSelectedImageId(1));
  expect(result.current).toBeNull();
  expect(dispose).toHaveBeenCalledOnce();
  act(() => useCameraStore.getState().setCameraDisplayMode('frustum'));
  expect(result.current).not.toBeNull();
  act(() => useUIStore.getState().setShowMatches(false));
  expect(result.current).toBeNull();
});
