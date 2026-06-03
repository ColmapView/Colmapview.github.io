import { BinaryWriter } from './BinaryWriter';
import type {
  Camera,
  CameraId,
  Image,
  ImageId,
  Point2D,
  Point3D,
  Point3DId,
} from '../types/colmap';
import type { Frame, FrameId, Rig, RigId } from '../types/rig';
import type { WasmReconstructionWrapper } from '../wasm/reconstruction';
import { sortedKeys, toBinaryPoint3DId } from './colmapWriterUtils';

/**
 * Write cameras.bin.
 */
export function writeCamerasBinary(cameras: Map<CameraId, Camera>): ArrayBuffer {
  const writer = new BinaryWriter();

  writer.writeUint64FromNumber(cameras.size);

  for (const cameraId of sortedKeys(cameras)) {
    const cam = cameras.get(cameraId)!;
    writer.writeUint32(cameraId);
    writer.writeInt32(cam.modelId);
    writer.writeUint64FromNumber(cam.width);
    writer.writeUint64FromNumber(cam.height);
    for (const param of cam.params) {
      writer.writeFloat64(param);
    }
  }

  return writer.toArrayBuffer();
}

/**
 * Write images.bin.
 */
export function writeImagesBinary(
  images: Map<ImageId, Image>,
  wasmReconstruction?: WasmReconstructionWrapper | null
): ArrayBuffer {
  const writer = new BinaryWriter();

  writer.writeUint64FromNumber(images.size);

  for (const imageId of sortedKeys(images)) {
    const img = images.get(imageId)!;

    writer.writeUint32(imageId);
    writer.writeFloat64(img.qvec[0]);
    writer.writeFloat64(img.qvec[1]);
    writer.writeFloat64(img.qvec[2]);
    writer.writeFloat64(img.qvec[3]);
    writer.writeFloat64(img.tvec[0]);
    writer.writeFloat64(img.tvec[1]);
    writer.writeFloat64(img.tvec[2]);
    writer.writeUint32(img.cameraId);
    writer.writeString(img.name);

    let points2D: Point2D[] = img.points2D;
    if (points2D.length === 0 && wasmReconstruction) {
      points2D = wasmReconstruction.getImagePoints2DArray(imageId);
    }

    writer.writeUint64FromNumber(points2D.length);
    for (const pt2D of points2D) {
      writer.writeFloat64(pt2D.xy[0]);
      writer.writeFloat64(pt2D.xy[1]);
      writer.writeUint64(toBinaryPoint3DId(pt2D.point3DId));
    }
  }

  return writer.toArrayBuffer();
}

/**
 * Write points3D.bin.
 */
export function writePoints3DBinary(points3D: Map<Point3DId, Point3D>): ArrayBuffer {
  const writer = new BinaryWriter();

  writer.writeUint64FromNumber(points3D.size);

  for (const point3DId of sortedKeys(points3D)) {
    const pt = points3D.get(point3DId)!;

    writer.writeUint64(point3DId);
    writer.writeFloat64(pt.xyz[0]);
    writer.writeFloat64(pt.xyz[1]);
    writer.writeFloat64(pt.xyz[2]);
    writer.writeUint8(pt.rgb[0]);
    writer.writeUint8(pt.rgb[1]);
    writer.writeUint8(pt.rgb[2]);
    writer.writeFloat64(pt.error);

    writer.writeUint64FromNumber(pt.track.length);
    for (const trackEl of pt.track) {
      writer.writeUint32(trackEl.imageId);
      writer.writeUint32(trackEl.point2DIdx);
    }
  }

  return writer.toArrayBuffer();
}

/**
 * Write rigs.bin.
 */
export function writeRigsBinary(rigs: Map<RigId, Rig>): ArrayBuffer {
  const writer = new BinaryWriter();

  writer.writeUint64FromNumber(rigs.size);

  for (const rigId of sortedKeys(rigs)) {
    const rig = rigs.get(rigId)!;

    writer.writeUint32(rigId);
    writer.writeUint32(rig.sensors.length);

    if (rig.sensors.length > 0) {
      const refSensorType = rig.refSensorId?.type ?? 0;
      const refSensorId = rig.refSensorId?.id ?? 0;
      writer.writeInt32(refSensorType);
      writer.writeUint32(refSensorId);

      for (let i = 1; i < rig.sensors.length; i++) {
        const sensor = rig.sensors[i];
        writer.writeInt32(sensor.sensorId.type);
        writer.writeUint32(sensor.sensorId.id);
        writer.writeUint8(sensor.hasPose ? 1 : 0);

        if (sensor.hasPose && sensor.pose) {
          writer.writeFloat64(sensor.pose.qvec[0]);
          writer.writeFloat64(sensor.pose.qvec[1]);
          writer.writeFloat64(sensor.pose.qvec[2]);
          writer.writeFloat64(sensor.pose.qvec[3]);
          writer.writeFloat64(sensor.pose.tvec[0]);
          writer.writeFloat64(sensor.pose.tvec[1]);
          writer.writeFloat64(sensor.pose.tvec[2]);
        }
      }
    }
  }

  return writer.toArrayBuffer();
}

/**
 * Write frames.bin.
 */
export function writeFramesBinary(frames: Map<FrameId, Frame>): ArrayBuffer {
  const writer = new BinaryWriter();

  writer.writeUint64FromNumber(frames.size);

  for (const frameId of sortedKeys(frames)) {
    const frame = frames.get(frameId)!;

    writer.writeUint32(frameId);
    writer.writeUint32(frame.rigId);
    writer.writeFloat64(frame.rigFromWorld.qvec[0]);
    writer.writeFloat64(frame.rigFromWorld.qvec[1]);
    writer.writeFloat64(frame.rigFromWorld.qvec[2]);
    writer.writeFloat64(frame.rigFromWorld.qvec[3]);
    writer.writeFloat64(frame.rigFromWorld.tvec[0]);
    writer.writeFloat64(frame.rigFromWorld.tvec[1]);
    writer.writeFloat64(frame.rigFromWorld.tvec[2]);
    writer.writeUint32(frame.dataIds.length);

    for (const dataMapping of frame.dataIds) {
      writer.writeInt32(dataMapping.sensorId.type);
      writer.writeUint32(dataMapping.sensorId.id);
      writer.writeUint64FromNumber(dataMapping.dataId);
    }
  }

  return writer.toArrayBuffer();
}
