import { SensorType } from '../types/rig';
import type { SensorType as SensorTypeValue } from '../types/rig';

const SENSOR_TYPE_VALUES: ReadonlySet<number> = new Set(Object.values(SensorType));

export function isSensorType(value: unknown): value is SensorTypeValue {
  return typeof value === 'number' && Number.isInteger(value) && SENSOR_TYPE_VALUES.has(value);
}

export function parseSensorType(value: number, context = 'sensor'): SensorTypeValue {
  if (isSensorType(value)) {
    return value;
  }

  throw new Error(`Unsupported sensor type ${value} in ${context}`);
}
