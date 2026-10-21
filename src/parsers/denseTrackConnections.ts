import type { ConnectedImagesIndex } from '../types/colmap';

/** Exact intersections of point-membership bitsets avoid quadratic Map updates
 * for dense tracks. Sparse inputs and duplicate references retain the old path.
 */
export function denseTrackConnections(imageIds: Iterable<number>, pointCount: number,
  offsets: Uint32Array, tracks: Uint32Array): ConnectedImagesIndex | null {
  const ids = [...imageIds], words = Math.ceil(pointCount / 32), budget = 256 * 1024 ** 2;
  if (!pointCount || !ids.length || offsets.length !== pointCount + 1 || offsets[0] !== 0 || offsets[pointCount] !== tracks.length) return null;
  let pairs = 0;
  for (let point = 0; point < pointCount; point++) {
    const length = offsets[point + 1] - offsets[point];
    if (length < 0 || offsets[point + 1] > tracks.length) return null;
    pairs += length * (length - 1) / 2;
  }
  if (pairs < 1_000_000 || ids.length * (ids.length - 1) / 2 * words >= pairs || ids.length * words * 4 > budget) return null;
  type Row = { id: number; bits: Uint32Array; lastPoint: number };
  const rows: Row[] = [], byId = new Map<number, Row>();
  const add = (id: number): Row => {
    const row = { id, bits: new Uint32Array(words), lastPoint: 0 };
    rows.push(row); byId.set(id, row); return row;
  };
  for (const id of ids) add(id);
  for (let point = 0; point < pointCount; point++) {
    const word = point >>> 5, mask = 1 << (point & 31), stamp = point + 1;
    for (let track = offsets[point]; track < offsets[point + 1]; track++) {
      const id = tracks[track];
      let row = byId.get(id);
      if (!row) {
        if ((rows.length + 1) * words * 4 > budget) return null;
        row = add(id);
      }
      if (row.lastPoint === stamp) return null;
      row.lastPoint = stamp; row.bits[word] |= mask;
    }
  }
  const needed = ids.length * (ids.length - 1) / 2 + ids.length * (rows.length - ids.length);
  if (needed * words >= pairs) return null;
  const result: ConnectedImagesIndex = new Map(ids.map(id => [id, new Map<number, number>()]));
  for (let first = 0; first < ids.length; first++) {
    const left = rows[first], neighbors = result.get(left.id)!;
    for (let second = first + 1; second < rows.length; second++) {
      const right = rows[second];
      let count = 0;
      for (let word = 0; word < words; word++) {
        let value = left.bits[word] & right.bits[word];
        if (!value) continue;
        if (value === -1) { count += 32; continue; }
        value -= (value >>> 1) & 0x55555555;
        value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
        count += (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
      }
      if (count) {
        neighbors.set(right.id, count);
        if (second < ids.length) result.get(right.id)!.set(left.id, count);
      }
    }
  }
  return result;
}

