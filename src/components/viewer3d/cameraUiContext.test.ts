import { describe, expect, it } from 'vitest';
import { CameraModelId } from '../../types/colmap';
import { buildCamera, buildImage, buildReconstruction } from '../../test/builders';
import { getCameraUiContext } from './cameraUiContext';

const regular = buildCamera();
const fisheye = buildCamera({ cameraId: 2, modelId: CameraModelId.OPENCV_FISHEYE });
const panorama = buildCamera({ cameraId: 3, modelId: CameraModelId.EQUIRECTANGULAR });
const images = [regular, fisheye, panorama].map(camera => buildImage({
  imageId: camera.cameraId, cameraId: camera.cameraId,
}));

describe('camera UI context', () => {
  it('derives the selected camera family separately from the families in a mixed session', () => {
    const reconstruction = buildReconstruction({ cameras: [regular, fisheye, panorama], images });
    for (const [imageId, family] of [[1, 'pinhole'], [2, 'fisheye'], [3, 'spherical']] as const) {
      expect(getCameraUiContext(reconstruction, imageId)).toEqual({
        hasPinholeCameras: true, hasSphericalCameras: true, selectedCameraFamily: family,
      });
    }
    expect(getCameraUiContext(reconstruction).selectedCameraFamily).toBeNull();
  });

  it('retains planar display modes for fisheye-only sessions and removes them for spherical-only sessions', () => {
    expect(getCameraUiContext(buildReconstruction({ cameras: [fisheye] }))).toMatchObject({
      hasPinholeCameras: true, hasSphericalCameras: false,
    });
    expect(getCameraUiContext(buildReconstruction({ cameras: [panorama] }))).toMatchObject({
      hasPinholeCameras: false, hasSphericalCameras: true,
    });
  });

  it('preserves the default controls before data loads and ignores stale selections', () => {
    expect(getCameraUiContext(null, 3)).toEqual({
      hasPinholeCameras: true, hasSphericalCameras: false, selectedCameraFamily: null,
    });
    expect(getCameraUiContext(buildReconstruction({ cameras: [panorama], images }), 99).selectedCameraFamily).toBeNull();
  });
});
