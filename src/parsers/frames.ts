import { BinaryReader } from './BinaryReader';
import type { Frame, FrameDataMapping } from '../types/rig';
import { SensorType } from '../types/rig';

/**
 * Parse frames.bin binary file
 *
 * Format:
 * - uint64: num_frames
 * - Per frame:
 *   - uint32: frame_id
 *   - uint32: rig_id
 *   - double[7]: rig_from_world (qw, qx, qy, qz, tx, ty, tz)
 *   - uint32: num_data_ids
 *   - Per data_id:
 *     - int32: sensor_type
 *     - uint32: sensor_id
 *     - uint64: data_id (image ID for camera sensors)
 */
export function parseFramesBinary(buffer: ArrayBuffer): Map<number, Frame> {
  const reader = new BinaryReader(buffer);
  const frames = new Map<number, Frame>();

  const numFrames = reader.readUint64AsNumber();

  for (let i = 0; i < numFrames; i++) {
    const frameId = reader.readUint32();
    const rigId = reader.readUint32();

    // Read rig_from_world pose: qw, qx, qy, qz, tx, ty, tz
    const qw = reader.readFloat64();
    const qx = reader.readFloat64();
    const qy = reader.readFloat64();
    const qz = reader.readFloat64();
    const tx = reader.readFloat64();
    const ty = reader.readFloat64();
    const tz = reader.readFloat64();

    const rigFromWorld = {
      qvec: [qw, qx, qy, qz] as [number, number, number, number],
      tvec: [tx, ty, tz] as [number, number, number],
    };

    const numDataIds = reader.readUint32();
    const dataIds: FrameDataMapping[] = [];

    for (let j = 0; j < numDataIds; j++) {
      const sensorType = reader.readInt32() as SensorType;
      const sensorId = reader.readUint32();
      const dataId = reader.readUint64AsNumber();

      dataIds.push({
        sensorId: { type: sensorType, id: sensorId },
        dataId,
      });
    }

    frames.set(frameId, {
      frameId,
      rigId,
      rigFromWorld,
      dataIds,
    });
  }

  return frames;
}

/**
 * Parse frames.txt text file
 *
 * Format:
 * # Frame list with one line of data per frame
 * # FRAME_ID, RIG_ID, QW, QX, QY, QZ, TX, TY, TZ, NUM_DATA_IDS
 * # SENSOR_TYPE, SENSOR_ID, DATA_ID
 * 1 1 1.0 0.0 0.0 0.0 0.0 0.0 0.0 3
 * 0 1 1
 * 0 2 2
 * 0 3 3
 */
export function parseFramesText(text: string): Map<number, Frame> {
  const frames = new Map<number, Frame>();
  const lines = text.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    // Skip comments and empty lines
    if (line.startsWith('#') || line === '') continue;

    const parts = line.split(/\s+/);
    if (parts.length < 10) continue;

    // Parse frame header: FRAME_ID, RIG_ID, QW, QX, QY, QZ, TX, TY, TZ, NUM_DATA_IDS
    const frameId = parseInt(parts[0]);
    const rigId = parseInt(parts[1]);
    const rigFromWorld = {
      qvec: [
        parseFloat(parts[2]),
        parseFloat(parts[3]),
        parseFloat(parts[4]),
        parseFloat(parts[5]),
      ] as [number, number, number, number],
      tvec: [
        parseFloat(parts[6]),
        parseFloat(parts[7]),
        parseFloat(parts[8]),
      ] as [number, number, number],
    };
    const numDataIds = parseInt(parts[9]);

    const dataIds: FrameDataMapping[] = [];

    // Read data ID mappings
    for (let j = 0; j < numDataIds && i < lines.length; j++) {
      const dataLine = lines[i].trim();
      i++;

      if (dataLine.startsWith('#') || dataLine === '') {
        j--; // Don't count this line
        continue;
      }

      const dataParts = dataLine.split(/\s+/);
      if (dataParts.length < 3) continue;

      dataIds.push({
        sensorId: {
          type: parseInt(dataParts[0]) as SensorType,
          id: parseInt(dataParts[1]),
        },
        dataId: parseInt(dataParts[2]),
      });
    }

    frames.set(frameId, {
      frameId,
      rigId,
      rigFromWorld,
      dataIds,
    });
  }

  return frames;
}
