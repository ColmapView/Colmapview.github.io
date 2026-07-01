import { describe, expect, it } from 'vitest';
import { CameraModelId } from '../../types/colmap';
import { buildCamera, buildImage, buildReconstruction } from '../../test/builders';
import { getRequestedSplatPsnrImageIds } from './splatPsnrImageIds';

describe('getRequestedSplatPsnrImageIds', () => {
  describe('scope=all', () => {
    it('excludes images whose camera is EQUIRECTANGULAR (spherical)', () => {
      const pinholeCamera = buildCamera({ cameraId: 1 });
      const sphericalCamera = buildCamera({
        cameraId: 2,
        modelId: CameraModelId.EQUIRECTANGULAR,
        width: 3840,
        height: 1920,
        params: [3840, 1920],
      });
      const pinholeImage = buildImage({ imageId: 1, cameraId: 1 });
      const sphericalImage = buildImage({ imageId: 2, cameraId: 2 });
      const reconstruction = buildReconstruction({
        cameras: [pinholeCamera, sphericalCamera],
        images: [pinholeImage, sphericalImage],
      });

      const result = getRequestedSplatPsnrImageIds({ id: 1, scope: 'all' }, reconstruction);

      expect(result).toContain(1);
      expect(result).not.toContain(2);
    });

    it('does not throw and returns empty array when all cameras are spherical', () => {
      const sphericalCamera = buildCamera({
        cameraId: 1,
        modelId: CameraModelId.EQUIRECTANGULAR,
        width: 3840,
        height: 1920,
        params: [3840, 1920],
      });
      const sphericalImage = buildImage({ imageId: 1, cameraId: 1 });
      const reconstruction = buildReconstruction({
        cameras: [sphericalCamera],
        images: [sphericalImage],
      });

      expect(() => getRequestedSplatPsnrImageIds({ id: 1, scope: 'all' }, reconstruction)).not.toThrow();
      expect(getRequestedSplatPsnrImageIds({ id: 1, scope: 'all' }, reconstruction)).toEqual([]);
    });

    it('keeps all pinhole images (regression — existing behavior unchanged)', () => {
      const reconstruction = buildReconstruction();

      const result = getRequestedSplatPsnrImageIds({ id: 1, scope: 'all' }, reconstruction);

      expect(result).toHaveLength(1);
    });

    it('includes images with fisheye cameras so the existing assertPinholeCamera backstop can handle them', () => {
      // Fisheye is not pinhole, but it was already handled by assertPinholeCamera in the session.
      // This test documents that only spherical (EQUIRECTANGULAR) cameras are excluded upstream;
      // other non-pinhole models (fisheye, etc.) continue to reach the session guard.
      const pinholeCamera = buildCamera({ cameraId: 1 });
      const fisheyeCamera = buildCamera({
        cameraId: 2,
        modelId: CameraModelId.OPENCV_FISHEYE,
        params: [500, 500, 320, 240, 0, 0, 0, 0],
      });
      const pinholeImage = buildImage({ imageId: 1, cameraId: 1 });
      const fisheyeImage = buildImage({ imageId: 2, cameraId: 2 });
      const reconstruction = buildReconstruction({
        cameras: [pinholeCamera, fisheyeCamera],
        images: [pinholeImage, fisheyeImage],
      });

      const result = getRequestedSplatPsnrImageIds({ id: 1, scope: 'all' }, reconstruction);

      expect(result).toContain(1);
      // Fisheye reaches the session backstop (assertPinholeCamera throws), not filtered here
      expect(result).toContain(2);
    });
  });

  describe('scope=selected', () => {
    it('returns empty array when the selected image uses a spherical camera', () => {
      const pinholeCamera = buildCamera({ cameraId: 1 });
      const sphericalCamera = buildCamera({
        cameraId: 2,
        modelId: CameraModelId.EQUIRECTANGULAR,
        width: 3840,
        height: 1920,
        params: [3840, 1920],
      });
      const pinholeImage = buildImage({ imageId: 1, cameraId: 1 });
      const sphericalImage = buildImage({ imageId: 2, cameraId: 2 });
      const reconstruction = buildReconstruction({
        cameras: [pinholeCamera, sphericalCamera],
        images: [pinholeImage, sphericalImage],
      });

      const result = getRequestedSplatPsnrImageIds(
        { id: 1, scope: 'selected', selectedImageId: 2 },
        reconstruction
      );

      expect(result).toEqual([]);
    });

    it('returns the image ID when the selected image uses a pinhole camera', () => {
      const reconstruction = buildReconstruction();

      const result = getRequestedSplatPsnrImageIds(
        { id: 1, scope: 'selected', selectedImageId: 1 },
        reconstruction
      );

      expect(result).toEqual([1]);
    });

    it('returns empty array when no selectedImageId is provided', () => {
      const reconstruction = buildReconstruction();

      expect(getRequestedSplatPsnrImageIds({ id: 1, scope: 'selected' }, reconstruction)).toEqual([]);
      expect(getRequestedSplatPsnrImageIds({ id: 1, scope: 'selected', selectedImageId: null }, reconstruction)).toEqual([]);
    });
  });
});
