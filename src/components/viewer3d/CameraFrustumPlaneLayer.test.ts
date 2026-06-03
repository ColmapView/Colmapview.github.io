import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildCamera, buildImage } from '../../test/builders';
import type { CameraFrustumItem } from './cameraFrustumViewModel';
import { buildImagePlaneRenderItems } from './cameraFrustumPlaneLayerPolicy';

function frustumItem(imageId: number, cameraIndex = 0): CameraFrustumItem {
  return {
    image: buildImage({ imageId, cameraId: 1, name: `image-${imageId}.jpg` }),
    camera: buildCamera({ cameraId: 1 }),
    position: new THREE.Vector3(imageId, 0, 0),
    quaternion: new THREE.Quaternion(),
    cameraIndex,
    numPoints3D: imageId * 10,
  };
}

describe('camera frustum plane layer policy', () => {
  it('builds non-selected image-plane render items with matched and deleted styling', () => {
    const items = buildImagePlaneRenderItems({
      frustums: [frustumItem(1), frustumItem(2), frustumItem(3), frustumItem(4)],
      selectedImageId: 1,
      matchedImageIds: new Set([2]),
      pendingDeletions: new Set([3]),
      imageFrameIndexMap: new Map(),
      lastNavigationToImageId: 4,
      frustumColorMode: 'single',
      frustumSingleColor: '#112233',
      selectionPlaneOpacity: 0.8,
      matchesOpacity: 0.5,
      unselectedCameraOpacity: 0.25,
      matchesColor: '#00ff00',
      deletedColor: '#ff4444',
    });

    expect(items.map(item => item.frustum.image.imageId)).toEqual([2, 3, 4]);
    expect(items[0]).toMatchObject({
      isMatched: true,
      style: { color: '#00ff00', opacity: 0.4 },
      wouldGoBack: false,
    });
    expect(items[1]).toMatchObject({
      isMatched: false,
      style: { color: '#ff4444', opacity: 0.3 },
      wouldGoBack: false,
    });
    expect(items[2]).toMatchObject({
      isMatched: false,
      style: { color: '#112233', opacity: 0.2 },
      wouldGoBack: true,
    });
  });

  it('uses selected-plane opacity for all image planes when no image is selected', () => {
    const items = buildImagePlaneRenderItems({
      frustums: [frustumItem(1), frustumItem(2)],
      selectedImageId: null,
      matchedImageIds: new Set(),
      pendingDeletions: new Set(),
      imageFrameIndexMap: new Map(),
      lastNavigationToImageId: null,
      frustumColorMode: 'single',
      frustumSingleColor: '#445566',
      selectionPlaneOpacity: 0.75,
      matchesOpacity: 0.5,
      unselectedCameraOpacity: 0.25,
      matchesColor: '#00ff00',
    });

    expect(items).toHaveLength(2);
    expect(items.map(item => item.style)).toEqual([
      { color: '#445566', opacity: 0.75 },
      { color: '#445566', opacity: 0.75 },
    ]);
  });
});
