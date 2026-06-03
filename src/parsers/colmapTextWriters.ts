import type {
  Camera,
  CameraId,
  Image,
  ImageId,
  Point2D,
  Point3D,
  Point3DId,
} from '../types/colmap';
import { UNMATCHED_POINT3D_ID } from '../types/colmap';
import type { Frame, FrameId, Rig, RigId } from '../types/rig';
import type { WasmReconstructionWrapper } from '../wasm/reconstruction';
import { CAMERA_MODEL_COLMAP_NAMES as CAMERA_MODEL_NAMES } from '../utils/cameraModelNames';
import { formatDouble, sortedKeys, toTextPoint3DId } from './colmapWriterUtils';

export function writeCamerasText(cameras: Map<CameraId, Camera>): string {
  const lines: string[] = [];

  lines.push('# Camera list with one line of data per camera:');
  lines.push('#   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]');
  lines.push(`# Number of cameras: ${cameras.size}`);

  for (const cameraId of sortedKeys(cameras)) {
    const cam = cameras.get(cameraId)!;
    const modelName = CAMERA_MODEL_NAMES[cam.modelId] ?? 'UNKNOWN';
    const params = cam.params.map(formatDouble).join(' ');
    lines.push(`${cameraId} ${modelName} ${cam.width} ${cam.height} ${params}`);
  }

  return lines.join('\n') + '\n';
}

export function writeImagesText(
  images: Map<ImageId, Image>,
  wasmReconstruction?: WasmReconstructionWrapper | null
): string {
  const lines: string[] = [];

  const getPoints2D = (img: Image): Point2D[] => {
    if (img.points2D.length > 0) return img.points2D;
    if (wasmReconstruction) {
      return wasmReconstruction.getImagePoints2DArray(img.imageId);
    }
    return [];
  };

  let totalObs = 0;
  for (const img of images.values()) {
    const points2D = getPoints2D(img);
    totalObs += points2D.filter((p) => p.point3DId !== UNMATCHED_POINT3D_ID).length;
  }
  const meanObs = images.size > 0 ? (totalObs / images.size).toFixed(6) : '0';

  lines.push('# Image list with two lines of data per image:');
  lines.push('#   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME');
  lines.push('#   POINTS2D[] as (X, Y, POINT3D_ID)');
  lines.push(`# Number of images: ${images.size}, mean observations per image: ${meanObs}`);

  for (const imageId of sortedKeys(images)) {
    const img = images.get(imageId)!;
    const [qw, qx, qy, qz] = img.qvec;
    const [tx, ty, tz] = img.tvec;
    lines.push(
      [
        imageId,
        formatDouble(qw),
        formatDouble(qx),
        formatDouble(qy),
        formatDouble(qz),
        formatDouble(tx),
        formatDouble(ty),
        formatDouble(tz),
        img.cameraId,
        img.name,
      ].join(' ')
    );

    const points2D = getPoints2D(img);
    const points2DStr = points2D
      .map((p) => `${formatDouble(p.xy[0])} ${formatDouble(p.xy[1])} ${toTextPoint3DId(p.point3DId)}`)
      .join(' ');
    lines.push(points2DStr);
  }

  return lines.join('\n') + '\n';
}

export function writePoints3DText(points3D: Map<Point3DId, Point3D>): string {
  const lines: string[] = [];

  let totalTrackLen = 0;
  for (const pt of points3D.values()) {
    totalTrackLen += pt.track.length;
  }
  const meanTrackLen = points3D.size > 0 ? (totalTrackLen / points3D.size).toFixed(6) : '0';

  lines.push('# 3D point list with one line of data per point:');
  lines.push('#   POINT3D_ID, X, Y, Z, R, G, B, ERROR, TRACK[] as (IMAGE_ID, POINT2D_IDX)');
  lines.push(`# Number of points: ${points3D.size}, mean track length: ${meanTrackLen}`);

  for (const point3DId of sortedKeys(points3D)) {
    const pt = points3D.get(point3DId)!;
    const [x, y, z] = pt.xyz;
    const [r, g, b] = pt.rgb;
    const trackStr = pt.track.map((t) => `${t.imageId} ${t.point2DIdx}`).join(' ');

    lines.push(
      [
        point3DId.toString(),
        formatDouble(x),
        formatDouble(y),
        formatDouble(z),
        r,
        g,
        b,
        formatDouble(pt.error),
        trackStr,
      ].join(' ')
    );
  }

  return lines.join('\n') + '\n';
}

export function writeRigsText(rigs: Map<RigId, Rig>): string {
  const lines: string[] = [];

  lines.push('# Rig list with one line per sensor');
  lines.push('# RIG_ID, NUM_SENSORS, REF_SENSOR_TYPE, REF_SENSOR_ID');
  lines.push('# SENSOR_TYPE, SENSOR_ID, HAS_POSE[, QW, QX, QY, QZ, TX, TY, TZ]');
  lines.push(`# Number of rigs: ${rigs.size}`);

  for (const rigId of sortedKeys(rigs)) {
    const rig = rigs.get(rigId)!;
    const refSensorType = rig.refSensorId?.type ?? 0;
    const refSensorId = rig.refSensorId?.id ?? 0;

    lines.push(`${rigId} ${rig.sensors.length} ${refSensorType} ${refSensorId}`);

    for (let i = 1; i < rig.sensors.length; i++) {
      const sensor = rig.sensors[i];
      const hasPose = sensor.hasPose ? 1 : 0;

      if (sensor.hasPose && sensor.pose) {
        const [qw, qx, qy, qz] = sensor.pose.qvec;
        const [tx, ty, tz] = sensor.pose.tvec;
        lines.push(
          `${sensor.sensorId.type} ${sensor.sensorId.id} ${hasPose} ${formatDouble(qw)} ${formatDouble(qx)} ${formatDouble(qy)} ${formatDouble(qz)} ${formatDouble(tx)} ${formatDouble(ty)} ${formatDouble(tz)}`
        );
      } else {
        lines.push(`${sensor.sensorId.type} ${sensor.sensorId.id} ${hasPose}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

export function writeFramesText(frames: Map<FrameId, Frame>): string {
  const lines: string[] = [];

  lines.push('# Frame list with one line of data per frame');
  lines.push('# FRAME_ID, RIG_ID, QW, QX, QY, QZ, TX, TY, TZ, NUM_DATA_IDS');
  lines.push('# SENSOR_TYPE, SENSOR_ID, DATA_ID');
  lines.push(`# Number of frames: ${frames.size}`);

  for (const frameId of sortedKeys(frames)) {
    const frame = frames.get(frameId)!;
    const [qw, qx, qy, qz] = frame.rigFromWorld.qvec;
    const [tx, ty, tz] = frame.rigFromWorld.tvec;

    lines.push(
      [
        frameId,
        frame.rigId,
        formatDouble(qw),
        formatDouble(qx),
        formatDouble(qy),
        formatDouble(qz),
        formatDouble(tx),
        formatDouble(ty),
        formatDouble(tz),
        frame.dataIds.length,
      ].join(' ')
    );

    for (const dataMapping of frame.dataIds) {
      lines.push(
        `${dataMapping.sensorId.type} ${dataMapping.sensorId.id} ${dataMapping.dataId}`
      );
    }
  }

  return lines.join('\n') + '\n';
}
