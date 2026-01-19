import { BinaryReader } from './BinaryReader';
import type { Rig, RigSensor, SensorId } from '../types/rig';
import { SensorType } from '../types/rig';

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
      const refType = reader.readInt32() as SensorType;
      const refId = reader.readUint32();
      refSensorId = { type: refType, id: refId };

      sensors.push({
        sensorId: refSensorId,
        hasPose: false, // Reference sensor has identity pose (implicit)
      });

      // Read additional sensors
      for (let j = 1; j < numSensors; j++) {
        const sensorType = reader.readInt32() as SensorType;
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
    const rigId = parseInt(parts[0]);
    const numSensors = parseInt(parts[1]);
    const refSensorType = parseInt(parts[2]) as SensorType;
    const refSensorId: SensorId = {
      type: refSensorType,
      id: parseInt(parts[3]),
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

      const sensorType = parseInt(sensorParts[0]) as SensorType;
      const sensorId = parseInt(sensorParts[1]);
      const hasPose = parseInt(sensorParts[2]) !== 0;

      const sensor: RigSensor = {
        sensorId: { type: sensorType, id: sensorId },
        hasPose,
      };

      if (hasPose && sensorParts.length >= 10) {
        sensor.pose = {
          qvec: [
            parseFloat(sensorParts[3]),
            parseFloat(sensorParts[4]),
            parseFloat(sensorParts[5]),
            parseFloat(sensorParts[6]),
          ],
          tvec: [
            parseFloat(sensorParts[7]),
            parseFloat(sensorParts[8]),
            parseFloat(sensorParts[9]),
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
