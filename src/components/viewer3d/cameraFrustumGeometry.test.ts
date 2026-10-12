import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildCameraFrustumItems,
  buildCameraIdToIndex,
  buildFrustumLineGeometryData,
  buildImageFrameIndexMap,
  getFrustumBaseColor,
  getFrustumMetricColorScale,
  getFrustumPlaneSize,
  isSplatMetricColorMode,
  type FrustumGeometryItem,
} from './cameraFrustumGeometry';
import {
  buildCamera,
  buildFile,
  buildImage,
  buildImageStats,
  buildReconstruction,
} from '../../test/builders';
import { CameraModelId } from '../../types/colmap';
import type { ImageId } from '../../types/colmap';
import { getCameraColor } from '../../theme';
import {
  SPLAT_PSNR_GREEN,
  SPLAT_PSNR_RED,
  SPLAT_PSNR_UNAVAILABLE_COLOR,
} from './splatPsnrMetric';

function buildFrustumGeometryItem({
  modelId = CameraModelId.PINHOLE,
  cameraIndex = 0,
  imageId = 1 as ImageId,
}: {
  modelId?: CameraModelId;
  cameraIndex?: number;
  imageId?: ImageId;
} = {}): FrustumGeometryItem {
  return {
    camera: buildCamera({ modelId }),
    image: buildImage({ imageId }),
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    cameraIndex,
  };
}

describe('camera frustum geometry helpers', () => {
  it('builds camera and rig-frame color indexes used for frustum coloring', () => {
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

    const cameraIdToIndex = buildCameraIdToIndex(reconstruction);
    const imageFrameIndexMap = buildImageFrameIndexMap(reconstruction);

    expect(Array.from(cameraIdToIndex.entries())).toEqual([
      [camera2.cameraId, 0],
      [camera1.cameraId, 1],
    ]);
    expect(Array.from(imageFrameIndexMap.entries())).toEqual([
      [frameA0.imageId, 0],
      [frameA1.imageId, 0],
      [frameB0.imageId, 1],
      [frameB1.imageId, 1],
    ]);
    expect(getFrustumBaseColor('single', true, 0, frameA0.imageId, imageFrameIndexMap, '#123456')).toBe('#123456');
    expect(getFrustumBaseColor('byRigFrame', true, 7, frameA1.imageId, imageFrameIndexMap, '#123456')).not.toBe('#123456');
    expect(getFrustumBaseColor('byRigFrame', true, 7, unpaired.imageId, imageFrameIndexMap, '#123456')).toBe('#123456');
    expect(getFrustumBaseColor(
      'splatPsnr',
      true,
      7,
      frameA0.imageId,
      imageFrameIndexMap,
      '#123456',
      new Map([[frameA0.imageId, { psnr: 30 }]])
    )).toBe(SPLAT_PSNR_GREEN);
    expect(getFrustumBaseColor(
      'splatSsim',
      true,
      7,
      frameA0.imageId,
      imageFrameIndexMap,
      '#123456',
      new Map([[frameA0.imageId, { psnr: 30, ssim: 0.95 }]])
    )).toBe(SPLAT_PSNR_GREEN);

    const psnrMetrics = new Map([
      [frameA0.imageId, { psnr: 20 }],
      [frameA1.imageId, { psnr: 25 }],
      [frameB0.imageId, { psnr: 30 }],
      [frameB1.imageId, { psnr: 35 }],
    ]);
    const psnrScale = getFrustumMetricColorScale(
      'splatPsnr',
      [frameA0.imageId, frameA1.imageId, frameB0.imageId, frameB1.imageId],
      psnrMetrics
    );
    expect(psnrScale).toEqual({ min: 20, max: 35 });
    expect(getFrustumBaseColor(
      'splatPsnr',
      true,
      7,
      frameA0.imageId,
      imageFrameIndexMap,
      '#123456',
      psnrMetrics,
      psnrScale
    )).toBe(SPLAT_PSNR_RED);
    expect(getFrustumBaseColor(
      'splatPsnr',
      true,
      7,
      frameB1.imageId,
      imageFrameIndexMap,
      '#123456',
      psnrMetrics,
      psnrScale
    )).toBe(SPLAT_PSNR_GREEN);

    const ssimMetrics = new Map([
      [frameA0.imageId, { psnr: 20, ssim: 0.82 }],
      [frameA1.imageId, { psnr: 25, ssim: 0.92 }],
    ]);
    const ssimScale = getFrustumMetricColorScale(
      'splatSsim',
      [frameA0.imageId, frameA1.imageId],
      ssimMetrics
    );
    expect(ssimScale).toEqual({ min: 0.82, max: 0.92 });
    expect(getFrustumBaseColor(
      'splatSsim',
      true,
      7,
      frameA0.imageId,
      imageFrameIndexMap,
      '#123456',
      ssimMetrics,
      ssimScale
    )).toBe(SPLAT_PSNR_RED);
    expect(getFrustumBaseColor(
      'splatSsim',
      true,
      7,
      frameA1.imageId,
      imageFrameIndexMap,
      '#123456',
      ssimMetrics,
      ssimScale
    )).toBe(SPLAT_PSNR_GREEN);
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
    expect(getFrustumPlaneSize(buildCamera({ width: 0, height: 400, params: [200] }), 2)).toEqual({
      width: 0,
      height: 0,
      depth: 2,
      offsetX: 0,
      offsetY: 0,
    });

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

  it('uses separate focal axes and principal-point offsets for pinhole image planes', () => {
    const camera = buildCamera({
      width: 800,
      height: 400,
      params: [200, 400, 410, 190],
    });
    const image = buildImage({ imageId: 1, cameraId: camera.cameraId });
    const reconstruction = buildReconstruction({ cameras: [camera], images: [image] });
    const [frustum] = buildCameraFrustumItems({
      reconstruction,
      imageSource: { getImageSync: () => undefined },
      cameraIdToIndex: buildCameraIdToIndex(reconstruction),
      pendingDeletions: new Set(),
    });

    const planeSize = getFrustumPlaneSize(camera, 2);
    expect(planeSize.width).toBeCloseTo(8);
    expect(planeSize.height).toBeCloseTo(2);
    expect(planeSize.depth).toBe(2);
    expect(planeSize.offsetX).toBeCloseTo(-0.1);
    expect(planeSize.offsetY).toBeCloseTo(0.05);

    const geometry = buildFrustumLineGeometryData([frustum], 2, {
      frustumColorMode: 'single',
      frustumSingleColor: '#336699',
      imageFrameIndexMap: new Map(),
    });

    expect(Array.from(geometry.positions.slice(0, 6))).toEqual([
      0,
      0,
      0,
      -4.099999904632568,
      -0.949999988079071,
      2,
    ]);
  });

  it.each([
    { name: 'off-center pinhole with separate focal axes', modelId: CameraModelId.PINHOLE,
      width: 800, height: 400, fx: 200, fy: 400, cx: 410, cy: 190,
      params: [200, 400, 410, 190] },
    { name: 'centered pinhole', modelId: CameraModelId.PINHOLE,
      width: 640, height: 480, fx: 500, fy: 500, cx: 320, cy: 240,
      params: [500, 500, 320, 240] },
    { name: 'Cam43 calibration', modelId: CameraModelId.SIMPLE_RADIAL,
      width: 2048, height: 2448, fx: 2354.8411128, fy: 2354.8411128,
      cx: 1008.7641493, cy: 1252.6265913,
      params: [2354.8411128, 1008.7641493, 1252.6265913, -0.0133410700] },
  ])('projects actual PlaneGeometry UVs onto COLMAP pixel rays: $name', (fixture) => {
    const camera = buildCamera(fixture);
    const planeSize = getFrustumPlaneSize(camera, 2);
    const geometry = new THREE.PlaneGeometry(planeSize.width, planeSize.height, 4, 4);
    const mesh = new THREE.Mesh(geometry);
    mesh.position.set(planeSize.offsetX, planeSize.offsetY, planeSize.depth);
    mesh.updateMatrixWorld();
    const positions = geometry.getAttribute('position');
    const uvs = geometry.getAttribute('uv');

    try {
      for (let index = 0; index < positions.count; index++) {
        const ray = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
        // Project in COLMAP's X-right, Y-down, Z-forward camera frame.
        // An unflipped ImageBitmap maps UV y=0 to the source image's top row.
        expect(fixture.fx * ray.x / ray.z + fixture.cx).toBeCloseTo(uvs.getX(index) * camera.width, 3);
        expect(fixture.fy * ray.y / ray.z + fixture.cy).toBeCloseTo(uvs.getY(index) * camera.height, 3);
      }
    } finally {
      geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });
});

describe('getFrustumPlaneSize spherical guard', () => {
  it('returns a zero-size plane for spherical cameras (no garbage frustum)', () => {
    const cam = buildCamera({ modelId: CameraModelId.EQUIRECTANGULAR, width: 4096, height: 2048, params: [4096, 2048] });
    const size = getFrustumPlaneSize(cam, 1);
    expect(size.width).toBe(0);
    expect(size.height).toBe(0);
  });

  it('still sizes a normal pinhole frustum', () => {
    const cam = buildCamera({ modelId: CameraModelId.PINHOLE, width: 640, height: 480, params: [500, 500, 320, 240] });
    const size = getFrustumPlaneSize(cam, 1);
    expect(size.width).toBeCloseTo(640 / 500);
    expect(size.height).toBeCloseTo(480 / 500);
  });
});

describe('splat-metric color mode helpers', () => {
  it('isSplatMetricColorMode is true only for the PSNR/SSIM metric modes', () => {
    expect(isSplatMetricColorMode('splatPsnr')).toBe(true);
    expect(isSplatMetricColorMode('splatSsim')).toBe(true);
    expect(isSplatMetricColorMode('single')).toBe(false);
    expect(isSplatMetricColorMode('byCamera')).toBe(false);
    expect(isSplatMetricColorMode('byRigFrame')).toBe(false);
  });

  it('renders a non-capable camera in its byCamera color under a metric mode', () => {
    expect(getFrustumBaseColor('splatPsnr', false, 0, 1 as ImageId, new Map(), '#000000'))
      .toBe(getCameraColor(0));
  });

  it('keeps the gray unavailable color for a capable camera with no metric (pending)', () => {
    expect(getFrustumBaseColor('splatPsnr', true, 0, 1 as ImageId, new Map(), '#000000'))
      .toBe(SPLAT_PSNR_UNAVAILABLE_COLOR);
  });

  it('uses the metric heatmap for a capable camera that has a value', () => {
    const map = new Map([[1 as ImageId, { psnr: 30 }]]);
    const color = getFrustumBaseColor('splatPsnr', true, 0, 1 as ImageId, new Map(), '#000000', map);
    expect(color).not.toBe(getCameraColor(0));
    expect(color).not.toBe(SPLAT_PSNR_UNAVAILABLE_COLOR);
  });

  it('buildFrustumLineGeometryData colors a fisheye camera byCamera under splatPsnr', () => {
    const item = buildFrustumGeometryItem({ modelId: CameraModelId.FISHEYE, cameraIndex: 0, imageId: 1 as ImageId });
    const { baseColors } = buildFrustumLineGeometryData([item], 0.1, {
      frustumColorMode: 'splatPsnr',
      frustumSingleColor: '#000000',
      imageFrameIndexMap: new Map(),
      splatPsnrByImage: new Map(),
    });
    const expected = new THREE.Color(getCameraColor(0));
    expect(baseColors[0]).toBeCloseTo(expected.r, 5);
    expect(baseColors[1]).toBeCloseTo(expected.g, 5);
    expect(baseColors[2]).toBeCloseTo(expected.b, 5);
  });

});
