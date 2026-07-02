import { describe, it, expect } from 'vitest';
import { buildCamera, buildImage } from '../../test/builders/colmapBuilders';
import { getImageWorldPose } from '../../utils/colmapTransforms';
import { CameraModelId } from '../../types/colmap';
import type { CameraFrustumItem } from './cameraFrustumGeometry';
import { partitionFrustumsByFamily } from './cameraFamilyPartition';

function item(modelId: number, imageId: number): CameraFrustumItem {
  const image = buildImage({ imageId });
  const { position, quaternion } = getImageWorldPose(image);
  return { image, camera: buildCamera({ modelId }), position, quaternion, cameraIndex: 0, numPoints3D: 0 };
}

describe('partitionFrustumsByFamily', () => {
  it('splits spherical from non-spherical, preserving order', () => {
    const items = [
      item(CameraModelId.PINHOLE, 1),
      item(CameraModelId.EQUIRECTANGULAR, 2),
      item(CameraModelId.OPENCV_FISHEYE, 3),
      item(CameraModelId.EQUIRECTANGULAR, 4),
    ];
    const { spherical, nonSpherical } = partitionFrustumsByFamily(items);
    expect(spherical.map((i) => i.image.imageId)).toEqual([2, 4]);
    expect(nonSpherical.map((i) => i.image.imageId)).toEqual([1, 3]);
  });

  it('routes out-of-registry model ids to the non-spherical bucket without throwing', () => {
    // A future/unknown model id (99) is not in CAMERA_MODEL_DESCRIPTORS; the registry
    // family lookup would throw. Partition must tolerate it and treat it as pinhole.
    const items = [
      item(99, 5),
      item(CameraModelId.EQUIRECTANGULAR, 6),
    ];

    expect(() => partitionFrustumsByFamily(items)).not.toThrow();

    const { spherical, nonSpherical } = partitionFrustumsByFamily(items);
    expect(nonSpherical.map((i) => i.image.imageId)).toEqual([5]);
    expect(spherical.map((i) => i.image.imageId)).toEqual([6]);
  });
});
