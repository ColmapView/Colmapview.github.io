import { BinaryReader } from './BinaryReader';
import type { Rig, RigSensor, SensorId } from '../types/rig';
import { parseSensorType } from '../utils/sensorTypePolicy';
import {
  parseColmapIntegerToken,
  parseColmapNumberTokens,
} from './colmapTextTokens';

/**
 * Parse rigs.bin binary file
 *
 * Format:
 * - uint64: num_rigs
 * - Per rig:
 *   - uint32: rig_id
 *   - uint32: num_sensors
 *   - if num_sensors > 0:
 *     - int32: ref_sensor_type, uint32: ref_sensor_id (reference sensor with identity pose)
 *   - for each additional sensor (num_sensors - 1):
 *     - int32: type, uint32: id, uint8: has_pose
 *     - if has_pose: double[7] (qw, qx, qy, qz, tx, ty, tz)
 */
export function parseRigsBinary(buffer: ArrayBuffer): Map<number, Rig> {
  const reader = new BinaryReader(buffer);
  const rigs = new Map<number, Rig>();

  const numRigs = reader.readUint64AsNumber();

  for (let i = 0; i < numRigs; i++) {
    const rigId = reader.readUint32();
    const numSensors = reader.readUint32();

    const sensors: RigSensor[] = [];
    let refSensorId: SensorId | null = null;

    if (numSensors > 0) {
      // Read reference sensor (first sensor, always has identity pose)
      const refType = parseSensorType(reader.readInt32(), `binary rig ${rigId} reference sensor`);
      const refId = reader.readUint32();
      refSensorId = { type: refType, id: refId };

      sensors.push({
        sensorId: refSensorId,
        hasPose: false, // Reference sensor has identity pose (implicit)
      });

      // Read additional sensors
      for (let j = 1; j < numSensors; j++) {
        const sensorType = parseSensorType(reader.readInt32(), `binary rig ${rigId} sensor ${j}`);
        const sensorId = reader.readUint32();
        const hasPose = reader.readUint8() !== 0;

        const sensor: RigSensor = {
          sensorId: { type: sensorType, id: sensorId },
          hasPose,
        };

        if (hasPose) {
          // Read sensor_from_rig pose: qw, qx, qy, qz, tx, ty, tz
          const qw = reader.readFloat64();
          const qx = reader.readFloat64();
          const qy = reader.readFloat64();
          const qz = reader.readFloat64();
          const tx = reader.readFloat64();
          const ty = reader.readFloat64();
          const tz = reader.readFloat64();

          sensor.pose = {
            qvec: [qw, qx, qy, qz],
            tvec: [tx, ty, tz],
          };
        }

        sensors.push(sensor);
      }
    }

    rigs.set(rigId, {
      rigId,
      refSensorId,
      sensors,
    });
  }

  return rigs;
}

/**
 * Parse rigs.txt text file
 *
 * Format:
 * # Rig list with one line per sensor
 * # RIG_ID, NUM_SENSORS, REF_SENSOR_TYPE, REF_SENSOR_ID
 * # SENSOR_TYPE, SENSOR_ID, HAS_POSE[, QW, QX, QY, QZ, TX, TY, TZ]
 * 1 3 0 1
 * 0 2 1 0.5 0.5 0.5 0.5 1.0 0.0 0.0
 * 0 3 1 0.7 0.0 0.7 0.0 -1.0 0.0 0.0
 */
export function parseRigsText(text: string): Map<number, Rig> {
  const rigs = new Map<number, Rig>();
  const lines = text.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    // Skip comments and empty lines
    if (line.startsWith('#') || line === '') continue;

    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;

    // Parse rig header: RIG_ID, NUM_SENSORS, REF_SENSOR_TYPE, REF_SENSOR_ID
    const rigId = parseColmapIntegerToken(parts[0], { min: 0 });
    const numSensors = parseColmapIntegerToken(parts[1], { min: 0 });
    const refSensorTypeValue = parseColmapIntegerToken(parts[2]);
    const refSensorIdValue = parseColmapIntegerToken(parts[3], { min: 0 });

    if (rigId === null || numSensors === null || refSensorTypeValue === null || refSensorIdValue === null) {
      continue;
    }

    const refSensorType = parseSensorType(refSensorTypeValue, `text rig ${rigId} reference sensor`);
    const refSensorId: SensorId = {
      type: refSensorType,
      id: refSensorIdValue,
    };

    const sensors: RigSensor[] = [];

    // Add reference sensor with identity pose
    sensors.push({
      sensorId: refSensorId,
      hasPose: false,
    });

    // Read additional sensors (num_sensors - 1 lines)
    for (let j = 1; j < numSensors && i < lines.length; j++) {
      const sensorLine = lines[i].trim();
      i++;

      if (sensorLine.startsWith('#') || sensorLine === '') {
        j--; // Don't count this line
        continue;
      }

      const sensorParts = sensorLine.split(/\s+/);
      if (sensorParts.length < 3) continue;

      const sensorTypeValue = parseColmapIntegerToken(sensorParts[0]);
      const sensorId = parseColmapIntegerToken(sensorParts[1], { min: 0 });
      const hasPoseValue = parseColmapIntegerToken(sensorParts[2], { min: 0 });

      if (sensorTypeValue === null || sensorId === null || hasPoseValue === null) continue;

      const sensorType = parseSensorType(sensorTypeValue, `text rig ${rigId} sensor ${j}`);
      const hasPose = hasPoseValue !== 0;

      const sensor: RigSensor = {
        sensorId: { type: sensorType, id: sensorId },
        hasPose,
      };

      if (hasPose) {
        const qvecValues = parseColmapNumberTokens(sensorParts.slice(3, 7));
        const tvecValues = parseColmapNumberTokens(sensorParts.slice(7, 10));
        if (qvecValues === null || tvecValues === null) continue;

        sensor.pose = {
          qvec: [
            qvecValues[0],
            qvecValues[1],
            qvecValues[2],
            qvecValues[3],
          ],
          tvec: [
            tvecValues[0],
            tvecValues[1],
            tvecValues[2],
          ],
        };
      }

      sensors.push(sensor);
    }

    rigs.set(rigId, {
      rigId,
      refSensorId,
      sensors,
    });
  }

  return rigs;
}
