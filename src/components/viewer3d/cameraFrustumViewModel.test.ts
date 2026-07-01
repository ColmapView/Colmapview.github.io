import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildCameraFrustumItems,
  buildCameraIdToIndex,
  buildFrustumLineGeometryData,
  buildImageFrameIndexMap,
  formatImageId,
  getAutoAdjustedFov,
  getCameraScaleValue,
  getFrustumPlaneSize,
  getWheelAdjustedFov,
  shouldFetchSelectedFrustumImageFile,
} from './cameraFrustumViewModel';
import { CameraModelId } from '../../types/colmap';
import {
  buildCamera,
  buildFile,
  buildImage,
  buildImageStats,
  buildReconstruction,
} from '../../test/builders';

describe('camera frustum view-model helpers', () => {
  it('formats image ID labels', () => {
    expect(formatImageId(12, 3, false)).toBe('#12');
    expect(formatImageId(12, 3, true)).toBe('#3:12');
  });

  it('derives camera scale from typed scale-factor options', () => {
    expect(getCameraScaleValue(2, '0.1')).toBe(0.2);
    expect(getCameraScaleValue(2, '1')).toBe(2);
    expect(getCameraScaleValue(2, '10')).toBe(20);
  });

  it('builds stable camera and rig-frame color indexes', () => {
    const camera2 = buildCamera({ cameraId: 2 });
    const camera1 = buildCamera({ cameraId: 1 });
    const frameA0 = buildImage({ imageId: 10, cameraId: camera1.cameraId, name: 'left/frame-0001.jpg' });
    const frameA1 = buildImage({ imageId: 11, cameraId: camera2.cameraId, name: 'right/frame-0001.jpg' });
    const unpaired = buildImage({ imageId: 12, cameraId: camera1.cameraId, name: 'left/frame-0002.jpg' });
    const frameB0 = buildImage({ imageId: 13, cameraId: camera1.cameraId, name: 'left/frame-0003.jpg' });
    const frameB1 = buildImage({ imageId: 14, cameraId: camera2.cameraId, name: 'right/frame-0003.jpg' });
    const reconstruction = buildReconstruction({
      cameras: [camera2, camera1],
      images: [frameA0, frameA1, unpaired, frameB0, frameB1],
    });

    expect(Array.from(buildCameraIdToIndex(reconstruction).entries())).toEqual([
      [camera2.cameraId, 0],
      [camera1.cameraId, 1],
    ]);
    expect(Array.from(buildImageFrameIndexMap(reconstruction).entries())).toEqual([
      [frameA0.imageId, 0],
      [frameA1.imageId, 0],
      [frameB0.imageId, 1],
      [frameB1.imageId, 1],
    ]);
  });

  it('builds renderable frustum items from reconstruction data', () => {
    const camera1 = buildCamera({ cameraId: 1 });
    const camera2 = buildCamera({ cameraId: 2 });
    const visible = buildImage({ imageId: 1, cameraId: camera1.cameraId, name: 'visible.jpg' });
    const deleted = buildImage({ imageId: 2, cameraId: camera1.cameraId, name: 'deleted.jpg' });
    const invalidPose = buildImage({ imageId: 3, cameraId: camera1.cameraId, name: 'invalid.jpg', tvec: [Number.NaN, 0, 0] });
    const missingCamera = buildImage({ imageId: 4, cameraId: 999, name: 'missing-camera.jpg' });
    const otherCamera = buildImage({ imageId: 5, cameraId: camera2.cameraId, name: 'other.jpg' });
    const imageFile = buildFile(visible.name);
    const reconstruction = buildReconstruction({
      cameras: [camera1, camera2],
      images: [visible, deleted, invalidPose, missingCamera, otherCamera],
      imageStats: new Map([[visible.imageId, buildImageStats({ numPoints3D: 42 })]]),
    });

    const frustums = buildCameraFrustumItems({
      reconstruction,
      imageSource: {
        getImageSync: (name) => name === visible.name ? imageFile : undefined,
      },
      cameraIdToIndex: buildCameraIdToIndex(reconstruction),
      pendingDeletions: new Set([deleted.imageId]),
    });

    expect(frustums.map(frustum => frustum.image.imageId)).toEqual([visible.imageId, otherCamera.imageId]);
    expect(frustums[0]).toMatchObject({
      image: visible,
      camera: camera1,
      imageFile,
      cameraIndex: 0,
      numPoints3D: 42,
    });
    expect(frustums[0].position.toArray()).toEqual([0, 0, 0]);
    expect(frustums[0].quaternion.equals(new THREE.Quaternion(0, 0, 0, 1))).toBe(true);
  });

  it('computes plane sizes and batched frustum line geometry', () => {
    const camera = buildCamera({
      width: 800,
      height: 400,
      params: [200, 200, 400, 200],
    });
    const image = buildImage({ imageId: 1, cameraId: camera.cameraId });
    const reconstruction = buildReconstruction({ cameras: [camera], images: [image] });
    const [frustum] = buildCameraFrustumItems({
      reconstruction,
      imageSource: { getImageSync: () => undefined },
      cameraIdToIndex: buildCameraIdToIndex(reconstruction),
      pendingDeletions: new Set(),
    });
    const singleColor = '#336699';
    const expectedColor = new THREE.Color(singleColor);

    expect(getFrustumPlaneSize(camera, 2)).toEqual({ width: 8, height: 4, depth: 2, offsetX: 0, offsetY: 0 });

    const geometry = buildFrustumLineGeometryData([frustum], 2, {
      frustumColorMode: 'single',
      frustumSingleColor: singleColor,
      imageFrameIndexMap: new Map(),
    });

    expect(Array.from(geometry.positions.slice(0, 6))).toEqual([0, 0, 0, -4, -2, 2]);
    expect(geometry.positions).toHaveLength(48);
    expect(geometry.baseColors).toHaveLength(48);
    expect(geometry.baseAlphas).toHaveLength(16);
    expect(geometry.baseColors[0]).toBeCloseTo(expectedColor.r);
    expect(geometry.baseColors[1]).toBeCloseTo(expectedColor.g);
    expect(geometry.baseColors[2]).toBeCloseTo(expectedColor.b);
    expect(Array.from(geometry.baseAlphas)).toEqual(Array(16).fill(1));
  });

  it('sizes pinhole image planes from fx and fy independently', () => {
    const camera = buildCamera({
      width: 800,
      height: 400,
      params: [200, 400, 410, 190],
    });
    const planeSize = getFrustumPlaneSize(camera, 2);

    expect(planeSize.width).toBeCloseTo(8);
    expect(planeSize.height).toBeCloseTo(2);
    expect(planeSize.offsetX).toBeCloseTo(-0.1);
    expect(planeSize.offsetY).toBeCloseTo(-0.05);
  });

  it('calculates auto-FOV adjustments only when image planes are outside the target range', () => {
    const camera = buildCamera({
      width: 800,
      height: 400,
      params: [200, 200, 400, 200],
    });
    const baseOptions = {
      camera,
      cameraScale: 2,
      viewportWidth: 1000,
      viewportHeight: 500,
    };

    expect(getAutoAdjustedFov({
      ...baseOptions,
      currentFov: 60,
    })).toBeCloseTo(102.68, 2);

    expect(getAutoAdjustedFov({
      ...baseOptions,
      currentFov: 103,
    })).toBeNull();

    expect(getAutoAdjustedFov({
      ...baseOptions,
      currentFov: 150,
    })).toBeCloseTo(102.68, 2);

    expect(getAutoAdjustedFov({
      ...baseOptions,
      camera: buildCamera({ width: 800, height: 400, params: [20, 20, 400, 200] }),
      currentFov: 60,
    })).toBe(120);

    expect(getAutoAdjustedFov({
      ...baseOptions,
      camera: buildCamera({ width: 0, height: 400, params: [200] }),
      currentFov: 60,
    })).toBeNull();
  });

  it('derives selected frustum FOV wheel adjustments and image fetch policy', () => {
    expect(getWheelAdjustedFov(60, 100)).toBe(62);
    expect(getWheelAdjustedFov(60, -100)).toBe(58);
    expect(getWheelAdjustedFov(178, 100)).toBe(179);
    expect(getWheelAdjustedFov(11, -100)).toBe(10);
    expect(getWheelAdjustedFov(50, 1, 5, 20, 80)).toBe(55);

    expect(shouldFetchSelectedFrustumImageFile({
      isSelected: true,
      showImagePlane: true,
      hasImageFile: false,
    })).toBe(true);
    expect(shouldFetchSelectedFrustumImageFile({
      isSelected: false,
      showImagePlane: true,
      hasImageFile: false,
    })).toBe(false);
    expect(shouldFetchSelectedFrustumImageFile({
      isSelected: true,
      showImagePlane: false,
      hasImageFile: false,
    })).toBe(false);
    expect(shouldFetchSelectedFrustumImageFile({
      isSelected: true,
      showImagePlane: true,
      hasImageFile: true,
    })).toBe(false);
  });

  it('frames the sphere diameter for spherical cameras, not the degenerate pinhole plane', () => {
    // EQUIRECTANGULAR: getCameraIntrinsics returns fx=fy=1 (unit default, no real focal length).
    // The old pinhole path would compute planeWidth = cameraScale * 3840 / 1 = 7680, which is
    // degenerate and causes the FOV to clamp to maxFov=120. The spherical branch should instead
    // frame the sphere of radius=cameraScale, yielding ~102.68° for a landscape viewport.
    const sphericalCamera = buildCamera({
      modelId: CameraModelId.EQUIRECTANGULAR,
      width: 3840,
      height: 1920,
      params: [3840, 1920],
    });
    const baseOptions = {
      camera: sphericalCamera,
      cameraScale: 2,
      viewportWidth: 1000,
      viewportHeight: 500,
    };

    // FOV too small → adjusts to frame the sphere (not the degenerate 120° the pinhole path gives)
    expect(getAutoAdjustedFov({ ...baseOptions, currentFov: 60 })).toBeCloseTo(102.68, 2);

    // FOV too large → also adjusts
    expect(getAutoAdjustedFov({ ...baseOptions, currentFov: 150 })).toBeCloseTo(102.68, 2);

    // FOV already in-range for sphere viewing (heightRatio ≈ 0.84 ∈ [0.5, 1.0]) → no adjustment
    expect(getAutoAdjustedFov({ ...baseOptions, currentFov: 100 })).toBeNull();

    // Degenerate: zero cameraScale → null
    expect(getAutoAdjustedFov({ ...baseOptions, cameraScale: 0, currentFov: 60 })).toBeNull();
  });

});
