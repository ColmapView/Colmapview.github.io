import { describe, expect, it } from 'vitest';
import { indexImageFile, readImageObservations } from './lazyImageFile';

/** Sparse test data exercises >2 GiB offsets without allocating that payload. */
class SparseBlob {
  constructor(readonly size: number, readonly parts: Array<[number, Uint8Array]>, readonly offset = 0) {}
  slice(start: number, end = this.size) {
    if (end - start > 1024 * 1024 * 2) throw new Error('Unbounded read');
    return new SparseBlob(Math.max(0, Math.min(end, this.size) - start), this.parts, this.offset + start) as unknown as Blob;
  }
  read() {
    const bytes = new Uint8Array(this.size);
    for (const [offset, part] of this.parts) {
      const first = Math.max(offset, this.offset), last = Math.min(offset + part.length, this.offset + this.size);
      if (last > first) bytes.set(part.subarray(first - offset, last - offset), first - this.offset);
    }
    return bytes.buffer;
  }
  async arrayBuffer() { return this.read(); }
}

function header(id: number, name: string, observations: number) {
  const encoded = new TextEncoder().encode(name), bytes = new Uint8Array(64 + encoded.length + 9);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, id, true); view.setFloat64(4, 1, true); view.setUint32(60, 3, true);
  bytes.set(encoded, 64); view.setBigUint64(65 + encoded.length, BigInt(observations), true);
  return bytes;
}

function fixture(observations = 100_000_000) {
  const first = header(5, 'front/a.png', observations), second = header(9, 'back/α.png', 1);
  const count = new Uint8Array(8); new DataView(count.buffer).setBigUint64(0, 2n, true);
  const offset = 8 + first.length + observations * 24;
  const observation = new Uint8Array(24), view = new DataView(observation.buffer);
  view.setFloat64(0, 123.123456789, true); view.setFloat64(8, 456.987654321, true);
  view.setBigInt64(16, 2n ** 53n + 7n, true);
  const parts: Array<[number, Uint8Array]> = [[0, count], [8, first], [offset, second], [offset + second.length, observation]];
  return new SparseBlob(offset + second.length + observation.length, parts);
}

describe('file-backed image observations', () => {
  it('indexes original poses and counts beyond 2 GiB without reading observation payloads', async () => {
    const file = fixture();
    const indexed = await indexImageFile(file as unknown as Blob);
    expect(file.size).toBeGreaterThan(2 ** 31);
    expect(indexed.buffer.byteLength).toBeLessThan(256);
    expect([...indexed.images.values()].map(image => [image.imageId, image.name, image.numPoints2D]))
      .toEqual([[5, 'front/a.png', 100_000_000], [9, 'back/α.png', 1]]);
    expect(indexed.ranges.get(9)!.offset).toBeGreaterThan(2 ** 31);
    const points = readImageObservations(file as unknown as Blob, indexed.ranges.get(9)!, slice => (slice as unknown as SparseBlob).read());
    expect(points).toEqual([{ xy: [123.123456789, 456.987654321], point3DId: 2n ** 53n + 7n }]);
  });

  it('rejects truncated observations, duplicate IDs and trailing data', async () => {
    const original = fixture(2);
    for (const size of [original.size - 1, original.size + 1]) {
      await expect(indexImageFile(new SparseBlob(size, original.parts) as unknown as Blob)).rejects.toThrow();
    }
    const duplicate = fixture(2);
    new DataView(duplicate.parts[2][1].buffer).setUint32(0, 5, true);
    await expect(indexImageFile(duplicate as unknown as Blob)).rejects.toThrow('duplicate');
  });

  it('rejects unsafe declared counts and failed on-demand reads', async () => {
    const file = fixture(2);
    const indexed = await indexImageFile(file as unknown as Blob);
    expect(() => readImageObservations(file as unknown as Blob, indexed.ranges.get(9)!, () => new ArrayBuffer(0))).toThrow('Truncated');
    new DataView(file.parts[0][1].buffer).setBigUint64(0, 2n ** 60n, true);
    await expect(indexImageFile(file as unknown as Blob)).rejects.toThrow('count');
  });
});
