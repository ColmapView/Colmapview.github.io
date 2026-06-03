import { describe, expect, it } from 'vitest';
import { SensorType } from '../types/rig';
import { isSensorType, parseSensorType } from './sensorTypePolicy';

describe('sensorTypePolicy', () => {
  it('narrows raw values to known COLMAP sensor types', () => {
    expect(isSensorType(SensorType.CAMERA)).toBe(true);
    expect(isSensorType(SensorType.IMU)).toBe(true);
    expect(isSensorType(999)).toBe(false);
    expect(isSensorType(1.5)).toBe(false);
    expect(isSensorType('1')).toBe(false);
  });

  it('parses supported sensor types and rejects unsupported values with context', () => {
    expect(parseSensorType(SensorType.CAMERA, 'binary rig 1 reference sensor')).toBe(SensorType.CAMERA);
    expect(() => parseSensorType(999, 'binary rig 1 reference sensor')).toThrow(
      'Unsupported sensor type 999 in binary rig 1 reference sensor'
    );
  });
});
