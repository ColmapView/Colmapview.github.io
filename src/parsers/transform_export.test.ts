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
import { copyBytesToArrayBuffer } from '../test/builders/fileFakes';
import type { Reconstruction } from '../types/colmap';
import { getBicycleFixtureDir, hasSparseBinaryFixture } from '../../tests/colmapFixturePaths';

const BIN = getBicycleFixtureDir();

describe.skipIf(!hasSparseBinaryFixture(BIN))('transform flows through export', () => {
  it('45° Y rotation changes exported qvecs and point xyz', () => {
    const toAB = (path: string): ArrayBuffer => {
      return copyBytesToArrayBuffer(readFileSync(path));
    };

    const cameras = parseCamerasBinary(toAB(resolve(BIN, 'cameras.bin')));
    const images = parseImagesBinary(toAB(resolve(BIN, 'images.bin')));
    const points3D = parsePoints3DBinary(toAB(resolve(BIN, 'points3D.bin')));

    const reconstruction: Reconstruction = {
      cameras,
      images,
      points3D,
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
  });
});
