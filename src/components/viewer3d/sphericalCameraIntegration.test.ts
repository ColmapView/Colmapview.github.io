/**
 * Integration test: mixed pinhole + spherical (EQUIRECTANGULAR) reconstruction.
 *
 * Locks three integration seams in one fixture:
 *  1. partitionFrustumsByFamily  — splits built frustum items into spherical / non-spherical
 *  2. getRequestedSplatPsnrImageIds — excludes the spherical image from PSNR evaluation
 *  3. getFrustumPlaneSize — returns zero-size for the spherical camera (Plan-1 guard)
 */
import { describe, it, expect } from 'vitest';
import { CameraModelId } from '../../types/colmap';
import { buildCamera, buildImage, buildReconstruction } from '../../test/builders';
import {
  buildCameraFrustumItems,
  buildCameraIdToIndex,
  getFrustumPlaneSize,
  type FrustumImageSource,
} from './cameraFrustumGeometry';
import { partitionFrustumsByFamily } from './cameraFamilyPartition';
import { getRequestedSplatPsnrImageIds } from './splatPsnrImageIds';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const PINHOLE_CAMERA_ID = 1;
const SPHERICAL_CAMERA_ID = 2;
const PINHOLE_IMAGE_ID = 10;
const SPHERICAL_IMAGE_ID = 20;

const pinholeCamera = buildCamera({
  cameraId: PINHOLE_CAMERA_ID,
  modelId: CameraModelId.PINHOLE,
  width: 640,
  height: 480,
  params: [500, 500, 320, 240],
});

const sphericalCamera = buildCamera({
  cameraId: SPHERICAL_CAMERA_ID,
  modelId: CameraModelId.EQUIRECTANGULAR,
  width: 4096,
  height: 2048,
  params: [4096, 2048],
});

const pinholeImage = buildImage({
  imageId: PINHOLE_IMAGE_ID,
  cameraId: PINHOLE_CAMERA_ID,
  name: 'pinhole/frame.jpg',
});

const sphericalImage = buildImage({
  imageId: SPHERICAL_IMAGE_ID,
  cameraId: SPHERICAL_CAMERA_ID,
  name: 'spherical/frame.jpg',
});

const reconstruction = buildReconstruction({
  cameras: [pinholeCamera, sphericalCamera],
  images: [pinholeImage, sphericalImage],
});

const imageSource: FrustumImageSource = {
  getImageSync: () => null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mixed pinhole + spherical reconstruction — integration seams', () => {
  it('partitionFrustumsByFamily yields exactly one spherical and one nonSpherical item with the correct image ids', () => {
    const cameraIdToIndex = buildCameraIdToIndex(reconstruction);
    const items = buildCameraFrustumItems({
      reconstruction,
      imageSource,
      cameraIdToIndex,
      pendingDeletions: new Set(),
    });

    // Sanity: both images produce a frustum item.
    expect(items).toHaveLength(2);

    const { spherical, nonSpherical } = partitionFrustumsByFamily(items);

    expect(spherical).toHaveLength(1);
    expect(nonSpherical).toHaveLength(1);

    // The spherical partition must contain the EQUIRECTANGULAR image.
    expect(spherical[0].image.imageId).toBe(SPHERICAL_IMAGE_ID);
    // The non-spherical partition must contain the PINHOLE image.
    expect(nonSpherical[0].image.imageId).toBe(PINHOLE_IMAGE_ID);
  });

  it('getRequestedSplatPsnrImageIds (scope=all) excludes the spherical image and includes the pinhole image', () => {
    const result = getRequestedSplatPsnrImageIds({ id: 1, scope: 'all' }, reconstruction);

    expect(result).toContain(PINHOLE_IMAGE_ID);
    expect(result).not.toContain(SPHERICAL_IMAGE_ID);
    expect(result).toHaveLength(1);
  });

  it('getFrustumPlaneSize is zero-size for the spherical camera and non-zero for the pinhole camera', () => {
    const scale = 1;

    const sphericalSize = getFrustumPlaneSize(sphericalCamera, scale);
    expect(sphericalSize.width).toBe(0);
    expect(sphericalSize.height).toBe(0);

    const pinholeSize = getFrustumPlaneSize(pinholeCamera, scale);
    // PINHOLE with fx=500, w=640, h=480: width = 640/500 = 1.28, height = 480/500 = 0.96
    expect(pinholeSize.width).toBeCloseTo(640 / 500);
    expect(pinholeSize.height).toBeCloseTo(480 / 500);
    expect(pinholeSize.width).toBeGreaterThan(0);
    expect(pinholeSize.height).toBeGreaterThan(0);
  });
});
