import { describe, expect, it, vi } from 'vitest';
import { CameraModelId, UNMATCHED_POINT3D_ID } from '../types/colmap';
import { SensorType, type Frame, type Rig } from '../types/rig';
import {
  buildCamera,
  buildImage,
  buildPoint2D,
  buildPoint3D,
  buildWasmReconstructionWrapper,
} from '../test/builders';
import {
  writeCamerasText,
  writeFramesText,
  writeImagesText,
  writePoints3DText,
  writeRigsText,
} from './colmapTextWriters';

describe('colmapTextWriters', () => {
  it('writes cameras in sorted ID order with COLMAP model names', () => {
    const cameras = new Map([
      [2, buildCamera({
        cameraId: 2,
        modelId: CameraModelId.SIMPLE_PINHOLE,
        width: 100,
        height: 80,
        params: [50, 50, 40],
      })],
      [1, buildCamera({ cameraId: 1 })],
    ]);

    expect(writeCamerasText(cameras)).toBe([
      '# Camera list with one line of data per camera:',
      '#   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]',
      '# Number of cameras: 2',
      '1 PINHOLE 640 480 500 500 320 240',
      '2 SIMPLE_PINHOLE 100 80 50 50 40',
      '',
    ].join('\n'));
  });

  it('writes images in sorted ID order and maps unmatched points to -1', () => {
    const images = new Map([
      [2, buildImage({
        imageId: 2,
        tvec: [1, 2, 3],
        name: 'beta.jpg',
        points2D: [
          buildPoint2D({ xy: [10, 20], point3DId: 5n }),
          buildPoint2D({ xy: [30, 40], point3DId: UNMATCHED_POINT3D_ID }),
        ],
      })],
      [1, buildImage({
        imageId: 1,
        qvec: [0.5, 0.5, 0.5, 0.5],
        name: 'alpha.jpg',
        points2D: [buildPoint2D({ xy: [1.5, 2.5], point3DId: 7n })],
      })],
    ]);

    expect(writeImagesText(images)).toBe([
      '# Image list with two lines of data per image:',
      '#   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME',
      '#   POINTS2D[] as (X, Y, POINT3D_ID)',
      '# Number of images: 2, mean observations per image: 1.000000',
      '1 0.5 0.5 0.5 0.5 0 0 0 1 alpha.jpg',
      '1.5 2.5 7',
      '2 1 0 0 0 1 2 3 1 beta.jpg',
      '10 20 5 30 40 -1',
      '',
    ].join('\n'));
  });

  it('loads image 2D points from WASM when in-memory points are empty', () => {
    const getImagePoints2DArray = vi.fn(() => [
      buildPoint2D({ xy: [9, 8], point3DId: 11n }),
      buildPoint2D({ xy: [7, 6], point3DId: UNMATCHED_POINT3D_ID }),
    ]);
    const wasmReconstruction = buildWasmReconstructionWrapper({ getImagePoints2DArray });
    const images = new Map([
      [3, buildImage({ imageId: 3, name: 'lazy.jpg', points2D: [] })],
    ]);

    const text = writeImagesText(images, wasmReconstruction);

    expect(getImagePoints2DArray).toHaveBeenCalledWith(3);
    expect(text).toContain('# Number of images: 1, mean observations per image: 1.000000');
    expect(text).toContain('9 8 11 7 6 -1');
  });

  it('writes 3D points in sorted ID order with track statistics', () => {
    const points3D = new Map([
      [2n, buildPoint3D({
        point3DId: 2n,
        xyz: [4, 5, 6],
        rgb: [7, 8, 9],
        error: 1.25,
        track: [{ imageId: 7, point2DIdx: 1 }],
      })],
      [1n, buildPoint3D({
        point3DId: 1n,
        xyz: [1, 2, 3],
        rgb: [1, 2, 3],
        error: 0.5,
        track: [
          { imageId: 9, point2DIdx: 4 },
          { imageId: 8, point2DIdx: 3 },
        ],
      })],
    ]);

    expect(writePoints3DText(points3D)).toBe([
      '# 3D point list with one line of data per point:',
      '#   POINT3D_ID, X, Y, Z, R, G, B, ERROR, TRACK[] as (IMAGE_ID, POINT2D_IDX)',
      '# Number of points: 2, mean track length: 1.500000',
      '1 1 2 3 1 2 3 0.5 9 4 8 3',
      '2 4 5 6 7 8 9 1.25 7 1',
      '',
    ].join('\n'));
  });

  it('writes rig and frame text with sensor poses and data IDs', () => {
    const rig: Rig = {
      rigId: 3,
      refSensorId: { type: SensorType.CAMERA, id: 1 },
      sensors: [
        { sensorId: { type: SensorType.CAMERA, id: 1 }, hasPose: false },
        {
          sensorId: { type: SensorType.CAMERA, id: 2 },
          hasPose: true,
          pose: { qvec: [1, 0, 0, 0], tvec: [1, 2, 3] },
        },
      ],
    };
    const frame: Frame = {
      frameId: 5,
      rigId: 3,
      rigFromWorld: { qvec: [1, 0, 0, 0], tvec: [1, 2, 3] },
      dataIds: [{ sensorId: { type: SensorType.CAMERA, id: 1 }, dataId: 42 }],
    };

    expect(writeRigsText(new Map([[3, rig]]))).toBe([
      '# Rig list with one line per sensor',
      '# RIG_ID, NUM_SENSORS, REF_SENSOR_TYPE, REF_SENSOR_ID',
      '# SENSOR_TYPE, SENSOR_ID, HAS_POSE[, QW, QX, QY, QZ, TX, TY, TZ]',
      '# Number of rigs: 1',
      '3 2 0 1',
      '0 2 1 1 0 0 0 1 2 3',
      '',
    ].join('\n'));
    expect(writeFramesText(new Map([[5, frame]]))).toBe([
      '# Frame list with one line of data per frame',
      '# FRAME_ID, RIG_ID, QW, QX, QY, QZ, TX, TY, TZ, NUM_DATA_IDS',
      '# SENSOR_TYPE, SENSOR_ID, DATA_ID',
      '# Number of frames: 1',
      '5 3 1 0 0 0 1 2 3 1',
      '0 1 42',
      '',
    ].join('\n'));
  });
});
