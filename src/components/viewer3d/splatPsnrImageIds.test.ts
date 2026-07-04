import { describe, expect, it } from 'vitest';
import { CameraModelId } from '../../types/colmap';
import { buildCamera, buildImage, buildReconstruction } from '../../test/builders';
import {
  getRequestedSplatPsnrImageIds,
  getSplatPsnrImageSelection,
  getSplatPsnrExclusionNotice,
} from './splatPsnrImageIds';

function buildMixedReconstruction(pinholeCount: number, sphericalCount: number) {
  const cameras = [];
  const images = [];
  let cameraId = 1;
  let imageId = 1;
  for (let i = 0; i < pinholeCount; i++) {
    cameras.push(buildCamera({ cameraId }));
    images.push(buildImage({ imageId, cameraId }));
    cameraId++;
    imageId++;
  }
  for (let i = 0; i < sphericalCount; i++) {
    cameras.push(
      buildCamera({
        cameraId,
        modelId: CameraModelId.EQUIRECTANGULAR,
        width: 3840,
        height: 1920,
        params: [3840, 1920],
      })
    );
    images.push(buildImage({ imageId, cameraId }));
    cameraId++;
    imageId++;
  }
  return buildReconstruction({ cameras, images });
}

function buildReconstructionWithCameraModels(modelIds: CameraModelId[]) {
  const cameras = modelIds.map((modelId, i) => buildCamera({ cameraId: i, modelId }));
  const images = modelIds.map((_, i) => buildImage({ imageId: i, cameraId: i }));
  return buildReconstruction({ cameras, images });
}

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

    it('keeps only metric-capable (undistorted pinhole) images', () => {
      const reconstruction = buildReconstructionWithCameraModels([
        CameraModelId.PINHOLE,
        CameraModelId.OPENCV,
        CameraModelId.FISHEYE,
        CameraModelId.EQUIRECTANGULAR,
      ]);

      const selection = getSplatPsnrImageSelection({ id: 1, scope: 'all' }, reconstruction);

      expect(selection.imageIds).toEqual([0]);
      expect(selection.excludedUnsupportedCount).toBe(3);
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

describe('getSplatPsnrImageSelection', () => {
  it('scope=all surfaces the excluded unsupported count on a mixed dataset', () => {
    const reconstruction = buildMixedReconstruction(2, 3);

    const selection = getSplatPsnrImageSelection({ id: 1, scope: 'all' }, reconstruction);

    // Two pinhole images (ids 1, 2) proceed; three spherical (ids 3, 4, 5) are excluded.
    expect(selection.imageIds).toEqual([1, 2]);
    expect(selection.excludedUnsupportedCount).toBe(3);
    expect(selection.selectedIsUnsupported).toBe(false);
  });

  it('scope=all reports zero exclusions for an all-pinhole dataset', () => {
    const reconstruction = buildMixedReconstruction(3, 0);

    const selection = getSplatPsnrImageSelection({ id: 1, scope: 'all' }, reconstruction);

    expect(selection.imageIds).toEqual([1, 2, 3]);
    expect(selection.excludedUnsupportedCount).toBe(0);
    expect(selection.selectedIsUnsupported).toBe(false);
  });

  it('scope=all reports every image excluded for an all-spherical dataset', () => {
    const reconstruction = buildMixedReconstruction(0, 4);

    const selection = getSplatPsnrImageSelection({ id: 1, scope: 'all' }, reconstruction);

    expect(selection.imageIds).toEqual([]);
    expect(selection.excludedUnsupportedCount).toBe(4);
    expect(selection.selectedIsUnsupported).toBe(false);
  });

  it('scope=selected flags a spherical selection and yields no image ids', () => {
    const reconstruction = buildMixedReconstruction(1, 1);

    const selection = getSplatPsnrImageSelection(
      { id: 1, scope: 'selected', selectedImageId: 2 },
      reconstruction
    );

    expect(selection.imageIds).toEqual([]);
    expect(selection.selectedIsUnsupported).toBe(true);
    expect(selection.excludedUnsupportedCount).toBe(0);
  });

  it('scope=selected flags a fisheye selection as unsupported', () => {
    const reconstruction = buildReconstructionWithCameraModels([CameraModelId.FISHEYE]);

    const selection = getSplatPsnrImageSelection(
      { id: 1, scope: 'selected', selectedImageId: 0 },
      reconstruction
    );

    expect(selection.imageIds).toEqual([]);
    expect(selection.selectedIsUnsupported).toBe(true);
  });

  it('scope=selected keeps a pinhole selection and does not flag spherical', () => {
    const reconstruction = buildMixedReconstruction(1, 1);

    const selection = getSplatPsnrImageSelection(
      { id: 1, scope: 'selected', selectedImageId: 1 },
      reconstruction
    );

    expect(selection.imageIds).toEqual([1]);
    expect(selection.selectedIsUnsupported).toBe(false);
    expect(selection.excludedUnsupportedCount).toBe(0);
  });

  it('mirrors getRequestedSplatPsnrImageIds exactly for every scope', () => {
    const mixed = buildMixedReconstruction(2, 3);
    expect(getSplatPsnrImageSelection({ id: 1, scope: 'all' }, mixed).imageIds).toEqual(
      getRequestedSplatPsnrImageIds({ id: 1, scope: 'all' }, mixed)
    );
    expect(
      getSplatPsnrImageSelection({ id: 1, scope: 'selected', selectedImageId: 3 }, mixed).imageIds
    ).toEqual(getRequestedSplatPsnrImageIds({ id: 1, scope: 'selected', selectedImageId: 3 }, mixed));
    expect(
      getSplatPsnrImageSelection({ id: 1, scope: 'selected', selectedImageId: 1 }, mixed).imageIds
    ).toEqual(getRequestedSplatPsnrImageIds({ id: 1, scope: 'selected', selectedImageId: 1 }, mixed));
  });
});

describe('getSplatPsnrExclusionNotice', () => {
  it('returns an info notice naming the unsupported count for partial exclusion', () => {
    const notice = getSplatPsnrExclusionNotice({
      imageIds: [1, 2],
      excludedUnsupportedCount: 3,
      selectedIsUnsupported: false,
    });

    expect(notice).not.toBeNull();
    expect(notice?.type).toBe('info');
    expect(notice?.message).toMatch(/unsupported/i);
    expect(notice?.message).toContain('3');
  });

  it('returns a warning notice for an unsupported selection', () => {
    const notice = getSplatPsnrExclusionNotice({
      imageIds: [],
      excludedUnsupportedCount: 0,
      selectedIsUnsupported: true,
    });

    expect(notice).not.toBeNull();
    expect(notice?.type).toBe('warning');
    expect(notice?.message).toMatch(/camera model/i);
  });

  it('returns null when nothing is excluded', () => {
    expect(
      getSplatPsnrExclusionNotice({
        imageIds: [1, 2, 3],
        excludedUnsupportedCount: 0,
        selectedIsUnsupported: false,
      })
    ).toBeNull();
  });

  it('surfaces a generalized exclusion notice', () => {
    const selection = { imageIds: [], excludedUnsupportedCount: 2, selectedIsUnsupported: false };

    expect(getSplatPsnrExclusionNotice(selection)?.message).toContain('2');
    expect(getSplatPsnrExclusionNotice(selection)?.message).toMatch(/unsupported/i);
  });
});
