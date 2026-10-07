/**
 * Verify the export path actually applies rotation to image poses and 3D points.
 * Skips if the bicycle fixture isn't present.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCamerasBinary } from './cameras';
import { parseImagesBinary } from './images';
import { parsePoints3DBinary } from './points3d';
import { writeImagesBinary, writePoints3DBinary } from './writers';
import {
  createSim3dFromEuler,
  transformReconstruction,
} from '../utils/sim3dTransforms';
import { buildGlobalStats } from '../test/builders/colmapBuilders';
import { copyBytesToArrayBuffer } from '../test/builders/fileFakes';
import type { Reconstruction } from '../types/colmap';
import {
  FIXTURE_SUITE_TIMEOUT_MS,
  getBicycleFixtureDir,
  hasSparseBinaryFixture,
} from '../../tests/colmapFixturePaths';

const BIN = getBicycleFixtureDir();
const missingFixture = !hasSparseBinaryFixture(BIN);

function toAB(path: string): ArrayBuffer {
  return copyBytesToArrayBuffer(readFileSync(path));
}

function parseBicycle() {
  return {
    cameras: parseCamerasBinary(toAB(resolve(BIN, 'cameras.bin'))),
    images: parseImagesBinary(toAB(resolve(BIN, 'images.bin'))),
    points3D: parsePoints3DBinary(toAB(resolve(BIN, 'points3D.bin'))),
  };
}

// Parsed once, while this file is collected: no per-test timeout applies there. The test below
// transforms and exports from this parse and only reads it. With the parse inside it, the test took
// 2.5-3 s of its 15 s budget under parallel load.
const bicycle = missingFixture ? null : parseBicycle();

describe.skipIf(missingFixture)('transform flows through export', () => {
  it('45° Y rotation changes exported qvecs and point xyz', () => {
    const { cameras, images, points3D } = bicycle!;

    const reconstruction: Reconstruction = {
      cameras,
      images,
      points3D,
      imageStats: new Map(),
      connectedImagesIndex: new Map(),
      globalStats: buildGlobalStats(),
      imageToPoint3DIds: new Map(),
    };

    // 45° rotation around Y
    const euler = {
      scale: 1,
      rotationX: 0,
      rotationY: Math.PI / 4,
      rotationZ: 0,
      translationX: 0,
      translationY: 0,
      translationZ: 0,
    };
    const sim3d = createSim3dFromEuler(euler);
    const transformed = transformReconstruction(sim3d, reconstruction);

    const origFirstImg = images.values().next().value!;
    const newFirstImg = transformed.images.values().next().value!;

    // qvec should differ when rotation is applied
    const qvecChanged = origFirstImg.qvec.some((v, i) => Math.abs(v - newFirstImg.qvec[i]) > 1e-6);
    expect(qvecChanged).toBe(true);

    // Points should be rotated too
    const origFirstPoint = points3D.values().next().value!;
    const newFirstPoint = transformed.points3D!.get(origFirstPoint.point3DId)!;
    const xyzChanged = origFirstPoint.xyz.some((v, i) => Math.abs(v - newFirstPoint.xyz[i]) > 1e-6);
    expect(xyzChanged).toBe(true);

    // Write and reparse to confirm qvecs and xyz survive round-trip with rotation
    const imagesBuf = writeImagesBinary(transformed.images);
    const reparseImgs = parseImagesBinary(imagesBuf);
    const reCamPose = reparseImgs.get(origFirstImg.imageId)!;
    expect(reCamPose.qvec).toEqual(newFirstImg.qvec);

    const pointsBuf = writePoints3DBinary(transformed.points3D!);
    const reparsePts = parsePoints3DBinary(pointsBuf);
    const rePt = reparsePts.get(origFirstPoint.point3DId)!;
    expect(rePt.xyz).toEqual(newFirstPoint.xyz);
  }, FIXTURE_SUITE_TIMEOUT_MS);
});
