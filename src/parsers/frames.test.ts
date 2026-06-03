import { describe, expect, it } from 'vitest';
import { BinaryWriter } from './BinaryWriter';
import { parseFramesBinary, parseFramesText } from './frames';
import { SensorType } from '../types/rig';

describe('parseFramesBinary', () => {
  it('parses supported sensor types', () => {
    const result = parseFramesBinary(createBinaryFrameBuffer(SensorType.IMU));

    const frame = result.get(1);
    expect(frame).toBeDefined();
    expect(frame!.dataIds[0].sensorId.type).toBe(SensorType.IMU);
  });

  it('rejects unsupported data ID sensor types', () => {
    expect(() => parseFramesBinary(createBinaryFrameBuffer(999))).toThrow(
      'Unsupported sensor type 999 in binary frame 1 data id 0'
    );
  });
});

describe('parseFramesText', () => {
  it('parses supported sensor types', () => {
    const result = parseFramesText(`1 1 1 0 0 0 0 0 0 1
1 2 42`);

    const frame = result.get(1);
    expect(frame).toBeDefined();
    expect(frame!.dataIds[0].sensorId.type).toBe(SensorType.IMU);
  });

  it('rejects unsupported data ID sensor types', () => {
    expect(() => parseFramesText(`1 1 1 0 0 0 0 0 0 1
999 2 42`)).toThrow(
      'Unsupported sensor type 999 in text frame 1 data id 0'
    );
  });

  it('skips frames with partial numeric header tokens', () => {
    const result = parseFramesText(`1 1px 1 0 0 0 0 0 0 0
2 1 1 0 0 0 0 0 0 0`);

    expect([...result.keys()]).toEqual([2]);
  });

  it('skips malformed data ID mappings without corrupting valid mappings', () => {
    const result = parseFramesText(`1 1 1 0 0 0 0 0 0 3
1px 2 42
1 2px 43
1 2 44`);

    expect(result.get(1)?.dataIds).toEqual([
      { sensorId: { type: SensorType.IMU, id: 2 }, dataId: 44 },
    ]);
  });
});

function createBinaryFrameBuffer(sensorType: number): ArrayBuffer {
  const writer = new BinaryWriter();
  writer.writeUint64FromNumber(1);
  writer.writeUint32(1);
  writer.writeUint32(1);
  writer.writeFloat64(1);
  writer.writeFloat64(0);
  writer.writeFloat64(0);
  writer.writeFloat64(0);
  writer.writeFloat64(0);
  writer.writeFloat64(0);
  writer.writeFloat64(0);
  writer.writeUint32(1);
  writer.writeInt32(sensorType);
  writer.writeUint32(2);
  writer.writeUint64FromNumber(42);
  return writer.toArrayBuffer();
}
