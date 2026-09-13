import type { Point3DIdLookup } from './types';

/** Binary-search IDs without a per-point JS Map. Sorted sources need no index buffer. */
export function createIndexedPointIdLookup(source: Point3DIdLookup, count: number): Point3DIdLookup {
  let ordered = true;
  for (let index = 1; index < count; index++) {
    const previous = source.get(index - 1);
    const current = source.get(index);
    // Accepted binary input can contain repeated IDs. Preserve selection of
    // every matching row through the scan path on this exceptional input.
    if (previous !== undefined && previous === current) return { get: (index) => source.get(index) };
    if (previous === undefined || current === undefined || previous >= current) {
      ordered = false;
      break;
    }
  }
  let order: Uint32Array | null = null;
  if (!ordered) {
    order = Uint32Array.from({ length: count }, (_, index) => index);
    order.sort((a, b) => {
      const left = source.get(a);
      const right = source.get(b);
      if (left === right) return 0;
      if (left === undefined) return 1;
      if (right === undefined) return -1;
      return left < right ? -1 : 1;
    });
    for (let index = 1; index < count; index++) {
      const previous = source.get(order[index - 1]);
      if (previous !== undefined && previous === source.get(order[index])) {
        return { get: (index) => source.get(index) };
      }
    }
  }
  return {
    get: (index) => source.get(index),
    findIndex(pointId) {
      let low = 0;
      let high = count;
      while (low < high) {
        const mid = low + Math.floor((high - low) / 2);
        const index = order ? order[mid] : mid;
        const candidate = source.get(index);
        if (candidate === pointId) return index;
        if (candidate === undefined || candidate > pointId) high = mid;
        else low = mid + 1;
      }
      return -1;
    },
  };
}
