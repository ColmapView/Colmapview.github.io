/**
 * Rig data integrity under image deletion and Sim3D transform.
 *
 * Guards:
 *  - filterReconstructionByImageIds strips deleted-image dataIds from every
 *    frame.dataIds and drops frames that become empty.
 *  - transformReconstruction applies the same math to frame.rigFromWorld as
 *    to image.qvec/tvec, and leaves sensor_from_rig poses untouched.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { Reconstruction, Image, Camera } from '../types/colmap';
import { CameraModelId } from '../types/colmap';
import type { Rig, Frame, RigData, RigPose } from '../types/rig';
import { SensorType } from '../types/rig';
import { filterReconstructionByImageIds } from '../store/actions/deletionActions';
import {
  createSim3dFromEuler,
  transformReconstruction,
} from '../utils/sim3dTransforms';
import {
  writeRigsBinary,
  writeFramesBinary,
} from './writers';
import { parseRigsBinary } from './rigs';
import { parseFramesBinary } from './frames';

const IDENTITY_POSE: RigPose = { qvec: [1, 0, 0, 0], tvec: [0, 0, 0] };

function makeCamera(id: number): Camera {
  return {
    cameraId: id,
    modelId: CameraModelId.PINHOLE,
    width: 1024,
    height: 768,
    params: [500, 500, 512, 384],
  };
}

function makeImage(id: number, cameraId: number): Image {
  return {
    imageId: id,
    qvec: [1, 0, 0, 0],
    tvec: [0, 0, 0],
    cameraId,
    name: `img_${id}.jpg`,
    points2D: [],
  };
}

/** 3-camera rig, 4 frames — every frame uses all 3 sensors */
function makeSyntheticRigData(): { reconstruction: Reconstruction; rigData: RigData } {
  const sensor1 = { type: SensorType.CAMERA, id: 1 };
  const sensor2 = { type: SensorType.CAMERA, id: 2 };
  const sensor3 = { type: SensorType.CAMERA, id: 3 };
  const rig: Rig = {
    rigId: 1,
    refSensorId: sensor1,
    sensors: [
      { sensorId: sensor1, hasPose: false },
      { sensorId: sensor2, hasPose: true, pose: { qvec: [0.9238795, 0, 0.3826834, 0], tvec: [0.2, 0, 0] } },
      { sensorId: sensor3, hasPose: true, pose: { qvec: [0.9238795, 0, -0.3826834, 0], tvec: [-0.2, 0, 0] } },
    ],
  };

  const frames = new Map<number, Frame>();
  // Frame 1: images 1, 2, 3
  frames.set(1, {
    frameId: 1,
    rigId: 1,
    rigFromWorld: { qvec: [0.7071068, 0, 0.7071068, 0], tvec: [1, 2, 3] },
    dataIds: [
      { sensorId: sensor1, dataId: 1 },
      { sensorId: sensor2, dataId: 2 },
      { sensorId: sensor3, dataId: 3 },
    ],
  });
  // Frame 2: images 4, 5, 6
  frames.set(2, {
    frameId: 2,
    rigId: 1,
    rigFromWorld: { qvec: [0.8660254, 0, 0.5, 0], tvec: [2, 2, 3] },
    dataIds: [
      { sensorId: sensor1, dataId: 4 },
      { sensorId: sensor2, dataId: 5 },
      { sensorId: sensor3, dataId: 6 },
    ],
  });
  // Frame 3: images 7, 8, 9
  frames.set(3, {
    frameId: 3,
    rigId: 1,
    rigFromWorld: IDENTITY_POSE,
    dataIds: [
      { sensorId: sensor1, dataId: 7 },
      { sensorId: sensor2, dataId: 8 },
      { sensorId: sensor3, dataId: 9 },
    ],
  });
  // Frame 4: images 10, 11, 12
  frames.set(4, {
    frameId: 4,
    rigId: 1,
    rigFromWorld: { qvec: [0.5, 0.5, 0.5, 0.5], tvec: [-1, -2, 1] },
    dataIds: [
      { sensorId: sensor1, dataId: 10 },
      { sensorId: sensor2, dataId: 11 },
      { sensorId: sensor3, dataId: 12 },
    ],
  });

  const rigs = new Map<number, Rig>([[1, rig]]);
  const rigData: RigData = { rigs, frames };

  const cameras = new Map<number, Camera>();
  for (let i = 1; i <= 3; i++) cameras.set(i, makeCamera(i));
  const images = new Map<number, Image>();
  for (let i = 1; i <= 12; i++) images.set(i, makeImage(i, ((i - 1) % 3) + 1));

  const reconstruction: Reconstruction = {
    cameras,
    images,
    imageStats: new Map(),
    connectedImagesIndex: new Map(),
    imageToPoint3DIds: new Map(),
    globalStats: {
      minError: 0, maxError: 0, avgError: 0,
      minTrackLength: 0, maxTrackLength: 0, avgTrackLength: 0,
      totalObservations: 0, totalPoints: 0,
    },
    rigData,
  };

  return { reconstruction, rigData };
}

describe('rig frame filtering on image deletion', () => {
  it('drops only the deleted dataIds and keeps frames with remaining sensors', () => {
    const { reconstruction } = makeSyntheticRigData();
    // Delete one sensor's image in frame 1 (image 2) and all sensors of frame 3 (7,8,9)
    const deleted = new Set([2, 7, 8, 9]);

    const filtered = filterReconstructionByImageIds(reconstruction, deleted)!;
    expect(filtered.rigData).toBeDefined();
    const { rigs, frames } = filtered.rigData!;

    // Rigs untouched
    expect(rigs).toBe(reconstruction.rigData!.rigs);

    // Frame 1 keeps 2 mappings (1 and 3), Frame 3 is removed, Frames 2 and 4 unchanged
    expect(frames.has(1)).toBe(true);
    expect(frames.has(2)).toBe(true);
    expect(frames.has(3)).toBe(false);
    expect(frames.has(4)).toBe(true);

    expect(frames.get(1)!.dataIds.map(d => d.dataId).sort()).toEqual([1, 3]);
    expect(frames.get(2)!.dataIds).toHaveLength(3);
    expect(frames.get(4)!.dataIds).toHaveLength(3);

    // No dataId in the output references a deleted image
    for (const frame of frames.values()) {
      for (const d of frame.dataIds) {
        expect(deleted.has(d.dataId)).toBe(false);
      }
    }
  });

  it('round-trips filtered rigs.bin + frames.bin', () => {
    const { reconstruction } = makeSyntheticRigData();
    const deleted = new Set([5, 11]);
    const filtered = filterReconstructionByImageIds(reconstruction, deleted)!;

    const rigsBuf = writeRigsBinary(filtered.rigData!.rigs);
    const framesBuf = writeFramesBinary(filtered.rigData!.frames);
    const reRigs = parseRigsBinary(rigsBuf);
    const reFrames = parseFramesBinary(framesBuf);

    expect(reRigs.size).toBe(filtered.rigData!.rigs.size);
    expect(reFrames.size).toBe(filtered.rigData!.frames.size);

    for (const [id, frame] of filtered.rigData!.frames) {
      const re = reFrames.get(id)!;
      expect(re.dataIds.map(d => d.dataId).sort()).toEqual(frame.dataIds.map(d => d.dataId).sort());
    }
  });
});

describe('rig frame transformation under Sim3D', () => {
  function applyPoseToPoint(
    qvec: [number, number, number, number],
    tvec: [number, number, number],
    p: [number, number, number],
  ): [number, number, number] {
    const q = new THREE.Quaternion(qvec[1], qvec[2], qvec[3], qvec[0]);
    const v = new THREE.Vector3(p[0], p[1], p[2]);
    v.applyQuaternion(q);
    v.x += tvec[0]; v.y += tvec[1]; v.z += tvec[2];
    return [v.x, v.y, v.z];
  }

  it('rotates rigFromWorld consistently with world transformation', () => {
    const { reconstruction } = makeSyntheticRigData();
    const sim3d = createSim3dFromEuler({
      scale: 1.25,
      rotationX: 0.1,
      rotationY: 0.6,
      rotationZ: -0.3,
      translationX: 0.4,
      translationY: 0.2,
      translationZ: -0.1,
    });
    const transformed = transformReconstruction(sim3d, reconstruction);
    expect(transformed.rigData).toBeDefined();

    // Integrity check: for any 3D point P_old, rig_from_old_world(P_old) * scale
    // should equal rig_from_new_world(P_new). This mirrors the camera
    // projection-consistency check that's already proven for camera poses.
    const testPoints: [number, number, number][] = [
      [1, 2, 3],
      [-0.5, 0, 2.1],
      [0, 0, 0],
    ];
    for (const [frameId, origFrame] of reconstruction.rigData!.frames) {
      const newFrame = transformed.rigData!.frames.get(frameId)!;
      for (const P of testPoints) {
        const rigOld = applyPoseToPoint(origFrame.rigFromWorld.qvec, origFrame.rigFromWorld.tvec, P);
        // P_new = sim3d applied to P
        const pv = new THREE.Vector3(P[0], P[1], P[2]);
        pv.applyQuaternion(sim3d.rotation);
        pv.multiplyScalar(sim3d.scale);
        pv.add(sim3d.translation);
        const Pnew: [number, number, number] = [pv.x, pv.y, pv.z];
        const rigNew = applyPoseToPoint(newFrame.rigFromWorld.qvec, newFrame.rigFromWorld.tvec, Pnew);

        // rigNew should equal scale * rigOld (same relationship as camera math)
        expect(rigNew[0]).toBeCloseTo(sim3d.scale * rigOld[0], 6);
        expect(rigNew[1]).toBeCloseTo(sim3d.scale * rigOld[1], 6);
        expect(rigNew[2]).toBeCloseTo(sim3d.scale * rigOld[2], 6);
      }
    }
  });

  it('leaves sensor_from_rig poses untouched (rigid body-frame)', () => {
    const { reconstruction } = makeSyntheticRigData();
    const sim3d = createSim3dFromEuler({
      scale: 2,
      rotationX: 0.5,
      rotationY: 0.5,
      rotationZ: 0.5,
      translationX: 1,
      translationY: 1,
      translationZ: 1,
    });
    const transformed = transformReconstruction(sim3d, reconstruction);
    const origRig = reconstruction.rigData!.rigs.get(1)!;
    const newRig = transformed.rigData!.rigs.get(1)!;
    for (let i = 0; i < origRig.sensors.length; i++) {
      const origSensor = origRig.sensors[i];
      const newSensor = newRig.sensors[i];
      expect(newSensor.hasPose).toBe(origSensor.hasPose);
      if (origSensor.pose) {
        expect(newSensor.pose!.qvec).toEqual(origSensor.pose.qvec);
        expect(newSensor.pose!.tvec).toEqual(origSensor.pose.tvec);
      }
    }
  });
});
