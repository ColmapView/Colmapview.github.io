import { describe, expect, it } from 'vitest';
import { BinaryWriter } from './BinaryWriter';
import { parseRigsBinary, parseRigsText } from './rigs';
import { SensorType } from '../types/rig';

describe('parseRigsBinary', () => {
  it('parses supported sensor types', () => {
    const result = parseRigsBinary(createBinaryRigBuffer(SensorType.CAMERA, SensorType.IMU));

    const rig = result.get(1);
    expect(rig).toBeDefined();
    expect(rig!.refSensorId?.type).toBe(SensorType.CAMERA);
    expect(rig!.sensors[1].sensorId.type).toBe(SensorType.IMU);
  });

  it('rejects unsupported reference sensor types', () => {
    expect(() => parseRigsBinary(createBinaryRigBuffer(999, SensorType.CAMERA))).toThrow(
      'Unsupported sensor type 999 in binary rig 1 reference sensor'
    );
  });

  it('rejects unsupported additional sensor types', () => {
    expect(() => parseRigsBinary(createBinaryRigBuffer(SensorType.CAMERA, 999))).toThrow(
      'Unsupported sensor type 999 in binary rig 1 sensor 1'
    );
  });
});

describe('parseRigsText', () => {
  it('parses supported sensor types', () => {
    const result = parseRigsText(`1 2 0 1
1 2 0`);

    const rig = result.get(1);
    expect(rig).toBeDefined();
    expect(rig!.refSensorId?.type).toBe(SensorType.CAMERA);
    expect(rig!.sensors[1].sensorId.type).toBe(SensorType.IMU);
  });

  it('rejects unsupported reference sensor types', () => {
    expect(() => parseRigsText('1 1 999 1')).toThrow(
      'Unsupported sensor type 999 in text rig 1 reference sensor'
    );
  });

  it('rejects unsupported additional sensor types', () => {
    expect(() => parseRigsText(`1 2 0 1
999 2 0`)).toThrow(
      'Unsupported sensor type 999 in text rig 1 sensor 1'
    );
  });

  it('skips rigs with partial numeric header tokens', () => {
    const result = parseRigsText(`1 1 0px 1
2 1 0 1`);

    expect([...result.keys()]).toEqual([2]);
  });

  it('skips malformed additional sensor lines without corrupting valid sensors', () => {
    const result = parseRigsText(`1 3 0 1
1 2 1 1 0 0 0 0 0 bad
1 3 1 1 0 0 0 0 0 0`);

    expect(result.get(1)?.sensors).toEqual([
      { sensorId: { type: SensorType.CAMERA, id: 1 }, hasPose: false },
      {
        sensorId: { type: SensorType.IMU, id: 3 },
        hasPose: true,
        pose: {
          qvec: [1, 0, 0, 0],
          tvec: [0, 0, 0],
        },
      },
    ]);
  });
});

function createBinaryRigBuffer(refSensorType: number, additionalSensorType: number): ArrayBuffer {
  const writer = new BinaryWriter();
  writer.writeUint64FromNumber(1);
  writer.writeUint32(1);
  writer.writeUint32(2);
  writer.writeInt32(refSensorType);
  writer.writeUint32(1);
  writer.writeInt32(additionalSensorType);
  writer.writeUint32(2);
  writer.writeUint8(0);
  return writer.toArrayBuffer();
}
