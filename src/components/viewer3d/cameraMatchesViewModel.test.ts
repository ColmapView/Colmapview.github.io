import { describe, expect, it } from 'vitest';
import { buildImage, buildReconstruction } from '../../test/builders';
import { buildCameraMatchLinePositions } from './cameraMatchesViewModel';

describe('camera matches view-model helpers', () => {
  it('returns null when match lines are not renderable', () => {
    const selected = buildImage({ imageId: 1 });
    const matched = buildImage({ imageId: 2 });
    const reconstruction = buildReconstruction({
      images: [selected, matched],
      connectedImagesIndex: new Map([[selected.imageId, new Map([[matched.imageId, 5]])]]),
    });

    expect(buildCameraMatchLinePositions({
      reconstruction: null,
      selectedImageId: selected.imageId,
      showMatches: true,
      cameraDisplayMode: 'frustum',
    })).toBeNull();
    expect(buildCameraMatchLinePositions({
      reconstruction,
      selectedImageId: null,
      showMatches: true,
      cameraDisplayMode: 'frustum',
    })).toBeNull();
    expect(buildCameraMatchLinePositions({
      reconstruction,
      selectedImageId: selected.imageId,
      showMatches: false,
      cameraDisplayMode: 'frustum',
    })).toBeNull();
    expect(buildCameraMatchLinePositions({
      reconstruction,
      selectedImageId: selected.imageId,
      showMatches: true,
      cameraDisplayMode: 'imageplane',
    })).toBeNull();
  });

  it('builds line positions from the selected image to connected images', () => {
    const selected = buildImage({ imageId: 1, tvec: [1, 0, 0] });
    const matchedA = buildImage({ imageId: 2, tvec: [0, 2, 0] });
    const matchedB = buildImage({ imageId: 3, tvec: [0, 0, 3] });
    const reconstruction = buildReconstruction({
      images: [selected, matchedA, matchedB],
      connectedImagesIndex: new Map([[
        selected.imageId,
        new Map([
          [matchedA.imageId, 5],
          [matchedB.imageId, 7],
        ]),
      ]]),
    });

    const positions = buildCameraMatchLinePositions({
      reconstruction,
      selectedImageId: selected.imageId,
      showMatches: true,
      cameraDisplayMode: 'frustum',
    });

    expect(Array.from(positions ?? [])).toEqual([
      -1, 0, 0,
      0, -2, 0,
      -1, 0, 0,
      0, 0, -3,
    ]);
  });

  it('skips connections whose image is no longer present', () => {
    const selected = buildImage({ imageId: 1, tvec: [1, 0, 0] });
    const matched = buildImage({ imageId: 2, tvec: [0, 2, 0] });
    const reconstruction = buildReconstruction({
      images: [selected, matched],
      connectedImagesIndex: new Map([[
        selected.imageId,
        new Map([
          [matched.imageId, 5],
          [99, 7],
        ]),
      ]]),
    });

    const positions = buildCameraMatchLinePositions({
      reconstruction,
      selectedImageId: selected.imageId,
      showMatches: true,
      cameraDisplayMode: 'arrow',
    });

    expect(Array.from(positions ?? [])).toEqual([
      -1, 0, 0,
      0, -2, 0,
    ]);
  });
});
