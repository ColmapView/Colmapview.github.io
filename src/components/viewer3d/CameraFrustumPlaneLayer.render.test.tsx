import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildCamera, buildImage } from '../../test/builders';
import type { CameraFrustumItem } from './cameraFrustumViewModel';
import { ImagePlaneFrustumPlanes } from './CameraFrustumPlaneLayer';

const { frustumPlaneProps } = vi.hoisted(() => ({
  frustumPlaneProps: [] as Array<{ image: { imageId: number }; showImagePlane: boolean }>,
}));

vi.mock('./FrustumPlane', () => ({
  FrustumPlane: (props: { image: { imageId: number }; showImagePlane: boolean }) => {
    frustumPlaneProps.push(props);
    return null;
  },
}));

function frustumItem(imageId: number): CameraFrustumItem {
  return {
    image: buildImage({ imageId, cameraId: 1, name: `image-${imageId}.jpg` }),
    camera: buildCamera({ cameraId: 1 }),
    position: new THREE.Vector3(imageId, 0, 0),
    quaternion: new THREE.Quaternion(),
    cameraIndex: 0,
    numPoints3D: imageId * 10,
  };
}

beforeEach(() => {
  frustumPlaneProps.length = 0;
});

afterEach(() => {
  cleanup();
});

describe('ImagePlaneFrustumPlanes', () => {
  it('keeps image textures enabled for non-selected planes while another image is selected', () => {
    render(
      <ImagePlaneFrustumPlanes
        frustums={[frustumItem(1), frustumItem(2)]}
        selectedImageId={1}
        matchedImageIds={new Set()}
        pendingDeletions={new Set()}
        imageFrameIndexMap={new Map()}
        lastNavigationToImageId={null}
        frustumColorMode="single"
        frustumSingleColor="#ff0000"
        selectionPlaneOpacity={0.8}
        matchesOpacity={0.5}
        unselectedCameraOpacity={0.25}
        matchesColor="#00ff00"
        cameraScale={1}
        hoveredImageId={null}
        onHover={vi.fn()}
        onClick={vi.fn()}
        onContextMenu={vi.fn()}
        touchMode={false}
        undistortionEnabled={false}
        undistortionMode="fullFrame"
        splatPsnrByImage={new Map()}
      />
    );

    expect(frustumPlaneProps).toHaveLength(1);
    expect(frustumPlaneProps[0]).toMatchObject({
      image: { imageId: 2 },
      showImagePlane: true,
    });
  });
});
