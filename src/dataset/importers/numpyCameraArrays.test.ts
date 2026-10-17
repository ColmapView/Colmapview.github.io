import { File as NodeFile, Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zipSync } from 'fflate';
import { numpyFixture, dtuFixture } from '../../test/numpyCameraFixtures';
import { readNumpyCameraArray, readDtuCameraArchive } from './numpyCameraArrays';

beforeEach(() => { vi.stubGlobal('File', NodeFile); vi.stubGlobal('Blob', NodeBlob); });
afterEach(() => vi.unstubAllGlobals());

describe('bounded camera array decoding', () => {
  for (const version of [1, 2, 3] as const) for (const float32 of [false, true]) for (const bigEndian of [false, true]) for (const fortran of [false, true]) {
    it(`reads NPY v${version}, f${float32 ? 4 : 8}, ${bigEndian ? 'big' : 'little'} endian, ${fortran ? 'column' : 'row'} order`, () => {
      const array = readNumpyCameraArray(numpyFixture(2, 3, [1, 2, 3, 4, 5, 6], { version, float32, bigEndian, fortran }));
      expect([array.rows, array.columns]).toEqual([2, 3]);
      expect([...array.values]).toEqual([1, 2, 3, 4, 5, 6]);
    });
  }
  it('rejects truncated or surplus array bytes and forged shapes', () => {
    const bytes = numpyFixture(1, 2, [1, 2]);
    expect(() => readNumpyCameraArray(bytes.subarray(0, bytes.length - 1))).toThrow(/payload/);
    expect(() => readNumpyCameraArray(new Uint8Array([...bytes, 0]))).toThrow(/payload/);
    bytes[6] = 4;
    expect(() => readNumpyCameraArray(bytes)).toThrow(/version/);
  });
  it('rejects object/pickle and structured arrays without evaluating headers', () => {
    const bytes = numpyFixture(1, 1, [1]);
    const text = new TextDecoder().decode(bytes.subarray(10, 128)).replace('<f8', '|O8');
    bytes.set(new TextEncoder().encode(text), 10);
    expect(() => readNumpyCameraArray(bytes)).toThrow(/object\/pickle/);
  });
  it('rejects malformed field separators', () => {
    const bytes = numpyFixture(1, 1, [1]);
    const header = new TextDecoder().decode(bytes.subarray(10, 128));
    bytes.set(new TextEncoder().encode(header.replace("'<f8',", "'<f8' ")), 10);
    expect(() => readNumpyCameraArray(bytes)).toThrow(/plain float32/);
  });
  it('preserves cancellation during NPZ reads', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(readDtuCameraArchive(new Uint8Array(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('skips unrelated NPZ arrays and reads only camera matrices', async () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const bytes = zipSync({ 'world_mat_0.npy': numpyFixture(4, 4, identity), 'scale_mat_0.npy': numpyFixture(4, 4, identity),
      'depth.npy': new Uint8Array([1, 2, 3]), 'object.npy': new Uint8Array([1]) });
    expect([...(await readDtuCameraArchive(bytes)).keys()]).toEqual(['world_mat_0', 'scale_mat_0']);
  });
  it('rejects noncanonical camera IDs and incorrect matrix shapes', async () => {
    await expect(readDtuCameraArchive(zipSync({ 'world_mat_00.npy': numpyFixture(1, 1, [1]) }))).rejects.toThrow(/ambiguous/);
    await expect(readDtuCameraArchive(zipSync({ 'world_mat_0.npy': numpyFixture(1, 1, [1]) }))).rejects.toThrow(/4 by 4/);
    expect((await readDtuCameraArchive(dtuFixture([[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]]))).size).toBe(2);
  });
  it('rejects damaged NPZ and inflated camera payloads before decoding', async () => {
    await expect(readDtuCameraArchive(new Uint8Array([1, 2, 3]))).rejects.toThrow(/NPZ/);
    await expect(readDtuCameraArchive(zipSync({ 'world_mat_0.npy': new Uint8Array(8193) }))).rejects.toThrow(/budget/);
  });
  it('checks selected NPZ camera payloads against ZIP integrity metadata', async () => {
    const bytes = zipSync({ 'world_mat_0.npy': numpyFixture(4, 4, new Array(16).fill(1)) }, { level: 0 });
    const local = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dataStart = 30 + local.getUint16(26, true) + local.getUint16(28, true);
    bytes[dataStart + 130] ^= 1;
    await expect(readDtuCameraArchive(bytes)).rejects.toThrow(/NPZ/);
  });
});
