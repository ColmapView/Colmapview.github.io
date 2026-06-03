import { describe, expect, it, vi } from 'vitest';
import { BinaryReader } from './BinaryReader';
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
  writeCamerasBinary,
  writeFramesBinary,
  writeImagesBinary,
  writePoints3DBinary,
  writeRigsBinary,
} from './colmapBinaryWriters';
import { COLMAP_INVALID_POINT3D_ID } from './colmapWriterUtils';

describe('colmapBinaryWriters', () => {
  it('writes cameras in sorted ID order', () => {
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
    const reader = new BinaryReader(writeCamerasBinary(cameras));

    expect(reader.readUint64AsNumber()).toBe(2);
    expect(reader.readUint32()).toBe(1);
    expect(reader.readInt32()).toBe(CameraModelId.PINHOLE);
    expect(reader.readUint64AsNumber()).toBe(640);
    expect(reader.readUint64AsNumber()).toBe(480);
    expect([reader.readFloat64(), reader.readFloat64(), reader.readFloat64(), reader.readFloat64()])
      .toEqual([500, 500, 320, 240]);

    expect(reader.readUint32()).toBe(2);
    expect(reader.readInt32()).toBe(CameraModelId.SIMPLE_PINHOLE);
    expect(reader.readUint64AsNumber()).toBe(100);
    expect(reader.readUint64AsNumber()).toBe(80);
    expect([reader.readFloat64(), reader.readFloat64(), reader.readFloat64()])
      .toEqual([50, 50, 40]);
    expect(reader.remaining).toBe(0);
  });

  it('writes images in sorted ID order and maps unmatched points to UINT64_MAX', () => {
    const getImagePoints2DArray = vi.fn(() => [
      buildPoint2D({ xy: [4.5, 5.5], point3DId: 9n }),
    ]);
    const wasmReconstruction = buildWasmReconstructionWrapper({ getImagePoints2DArray });
    const images = new Map([
      [3, buildImage({ imageId: 3, name: 'lazy.jpg', points2D: [] })],
      [1, buildImage({
        imageId: 1,
        qvec: [0.5, 0.5, 0.5, 0.5],
        tvec: [0, 1, 2],
        name: 'alpha.jpg',
        points2D: [
          buildPoint2D({ xy: [1, 2], point3DId: 5n }),
          buildPoint2D({ xy: [3, 4], point3DId: UNMATCHED_POINT3D_ID }),
        ],
      })],
    ]);
    const reader = new BinaryReader(writeImagesBinary(images, wasmReconstruction));

    expect(reader.readUint64AsNumber()).toBe(2);
    expect(reader.readUint32()).toBe(1);
    expect([
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
    ]).toEqual([0.5, 0.5, 0.5, 0.5, 0, 1, 2]);
    expect(reader.readUint32()).toBe(1);
    expect(reader.readString()).toBe('alpha.jpg');
    expect(reader.readUint64AsNumber()).toBe(2);
    expect([reader.readFloat64(), reader.readFloat64(), reader.readUint64()])
      .toEqual([1, 2, 5n]);
    expect([reader.readFloat64(), reader.readFloat64(), reader.readUint64()])
      .toEqual([3, 4, COLMAP_INVALID_POINT3D_ID]);

    expect(reader.readUint32()).toBe(3);
    expect([
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
    ]).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(reader.readUint32()).toBe(1);
    expect(reader.readString()).toBe('lazy.jpg');
    expect(reader.readUint64AsNumber()).toBe(1);
    expect([reader.readFloat64(), reader.readFloat64(), reader.readUint64()])
      .toEqual([4.5, 5.5, 9n]);
    expect(getImagePoints2DArray).toHaveBeenCalledWith(3);
    expect(reader.remaining).toBe(0);
  });

  it('writes 3D points in sorted ID order with tracks', () => {
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
    const reader = new BinaryReader(writePoints3DBinary(points3D));

    expect(reader.readUint64AsNumber()).toBe(2);
    expect(reader.readUint64()).toBe(1n);
    expect([reader.readFloat64(), reader.readFloat64(), reader.readFloat64()])
      .toEqual([1, 2, 3]);
    expect([reader.readUint8(), reader.readUint8(), reader.readUint8()])
      .toEqual([1, 2, 3]);
    expect(reader.readFloat64()).toBe(0.5);
    expect(reader.readUint64AsNumber()).toBe(2);
    expect([reader.readUint32(), reader.readUint32(), reader.readUint32(), reader.readUint32()])
      .toEqual([9, 4, 8, 3]);

    expect(reader.readUint64()).toBe(2n);
    expect([reader.readFloat64(), reader.readFloat64(), reader.readFloat64()])
      .toEqual([4, 5, 6]);
    expect([reader.readUint8(), reader.readUint8(), reader.readUint8()])
      .toEqual([7, 8, 9]);
    expect(reader.readFloat64()).toBe(1.25);
    expect(reader.readUint64AsNumber()).toBe(1);
    expect([reader.readUint32(), reader.readUint32()]).toEqual([7, 1]);
    expect(reader.remaining).toBe(0);
  });

  it('writes rig records with reference sensors and posed sensors', () => {
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
    const reader = new BinaryReader(writeRigsBinary(new Map([[3, rig]])));

    expect(reader.readUint64AsNumber()).toBe(1);
    expect(reader.readUint32()).toBe(3);
    expect(reader.readUint32()).toBe(2);
    expect(reader.readInt32()).toBe(SensorType.CAMERA);
    expect(reader.readUint32()).toBe(1);
    expect(reader.readInt32()).toBe(SensorType.CAMERA);
    expect(reader.readUint32()).toBe(2);
    expect(reader.readUint8()).toBe(1);
    expect([
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
    ]).toEqual([1, 0, 0, 0, 1, 2, 3]);
    expect(reader.remaining).toBe(0);
  });

  it('writes frame records with pose and data IDs', () => {
    const frame: Frame = {
      frameId: 5,
      rigId: 3,
      rigFromWorld: { qvec: [1, 0, 0, 0], tvec: [1, 2, 3] },
      dataIds: [{ sensorId: { type: SensorType.CAMERA, id: 1 }, dataId: 42 }],
    };
    const reader = new BinaryReader(writeFramesBinary(new Map([[5, frame]])));

    expect(reader.readUint64AsNumber()).toBe(1);
    expect(reader.readUint32()).toBe(5);
    expect(reader.readUint32()).toBe(3);
    expect([
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
    ]).toEqual([1, 0, 0, 0, 1, 2, 3]);
    expect(reader.readUint32()).toBe(1);
    expect(reader.readInt32()).toBe(SensorType.CAMERA);
    expect(reader.readUint32()).toBe(1);
    expect(reader.readUint64AsNumber()).toBe(42);
    expect(reader.remaining).toBe(0);
  });
});
