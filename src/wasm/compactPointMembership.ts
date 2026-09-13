import type { ImageToPoint3DIdsMap } from '../types/colmap';
import type { WasmReconstructionWrapper } from './reconstruction';

/** Dedicated transfer buffers; offsets delimit insertion-ordered, unique IDs for each image. */
export interface CompactPointMembership {
  imageIds: Float64Array;
  offsets: Uint32Array;
  pointIds: BigUint64Array;
}

type PointTrackSource = Pick<WasmReconstructionWrapper, 'pointCount' | 'getTrackOffsets' | 'getTrackImageIds' | 'getPoint3DIds'>;

function hasDuplicatePointIds(ids: BigUint64Array): boolean {
  let increasing = true;
  for (let i = 1; i < ids.length; i++) {
    if (ids[i] <= ids[i - 1]) { increasing = false; break; }
  }
  if (increasing) return false;
  // Normal sorted IDs need no allocation. Unsorted input uses a temporary native
  // uint64 sort to prove uniqueness without retaining one boxed bigint per ID.
  const sorted = ids.slice().sort();
  for (let i = 1; i < sorted.length; i++) if (sorted[i] === sorted[i - 1]) return true;
  return false;
}

/** Builds the same per-image Set membership directly from immutable WASM CSR tracks. */
export function buildPointMembershipFromWasm(images: ReadonlyMap<number, unknown>, source: PointTrackSource): CompactPointMembership {
  const imageIds = new Float64Array(images.size);
  const imageIndices = new Map<number, number>();
  let imageIndex = 0;
  for (const imageId of images.keys()) {
    if (!Number.isSafeInteger(imageId) || imageId < 0) throw new Error('Invalid point membership image ID');
    imageIds[imageIndex] = imageId;
    imageIndices.set(imageId, imageIndex++);
  }
  const offsets = new Uint32Array(images.size + 1);
  const pointCount = source.pointCount;
  if (!Number.isSafeInteger(pointCount) || pointCount < 0 || pointCount > 0xffffffff) throw new Error('Unsupported point membership point count');
  if (pointCount === 0) return { imageIds, offsets, pointIds: new BigUint64Array() };
  const trackOffsets = source.getTrackOffsets();
  const trackImages = source.getTrackImageIds();
  const sourceIds = source.getPoint3DIds();
  if (!trackOffsets || !trackImages || trackOffsets.length !== pointCount + 1 || trackOffsets[0] !== 0
    || trackOffsets[pointCount] !== trackImages.length || (sourceIds && sourceIds.length !== pointCount)) {
    throw new Error('Invalid point membership track arrays');
  }

  const counts = new Uint32Array(images.size);
  const lastSeenPoint = new Uint32Array(images.size);
  let totalMemberships = 0;
  for (let point = 0; point < pointCount; point++) {
    const start = trackOffsets[point];
    const end = trackOffsets[point + 1];
    if (start > end || end > trackImages.length) throw new Error('Invalid point membership track offsets');
    const marker = point + 1;
    for (let track = start; track < end; track++) {
      const index = imageIndices.get(trackImages[track]);
      if (index === undefined || lastSeenPoint[index] === marker) continue;
      lastSeenPoint[index] = marker;
      counts[index]++;
      if (++totalMemberships > 0xffffffff) throw new Error('Point membership exceeds the supported offset range');
    }
  }
  if (totalMemberships === 0) return { imageIds, offsets, pointIds: new BigUint64Array() };

  // Duplicate point records are invalid COLMAP, but the existing parser accepts
  // them. Retain its Set-by-ID dedup semantics instead of returning duplicate
  // values from a ReadonlySet view. Only this exceptional input builds Sets.
  if (sourceIds && hasDuplicatePointIds(sourceIds)) {
    const membership = new Map<number, Set<bigint>>();
    for (const imageId of images.keys()) membership.set(imageId, new Set());
    for (let point = 0; point < pointCount; point++) {
      const id = sourceIds[point];
      for (let track = trackOffsets[point]; track < trackOffsets[point + 1]; track++) {
        membership.get(trackImages[track])?.add(id);
      }
    }
    return packPointMembership(membership);
  }

  let offset = 0;
  for (let i = 0; i < imageIds.length; i++) {
    offsets[i] = offset;
    offset += counts[i];
    counts[i] = offsets[i]; // Reuse the count buffer as each image's write cursor.
  }
  offsets[imageIds.length] = offset;
  const pointIds = new BigUint64Array(totalMemberships);
  lastSeenPoint.fill(0);
  for (let point = 0; point < pointCount; point++) {
    const id = sourceIds ? sourceIds[point] : BigInt(point + 1);
    const marker = point + 1;
    for (let track = trackOffsets[point]; track < trackOffsets[point + 1]; track++) {
      const index = imageIndices.get(trackImages[track]);
      if (index === undefined || lastSeenPoint[index] === marker) continue;
      lastSeenPoint[index] = marker;
      pointIds[counts[index]++] = id;
    }
  }
  return { imageIds, offsets, pointIds };
}

export function packPointMembership(membership: ReadonlyMap<number, ReadonlySet<bigint>>): CompactPointMembership {
  let count = 0;
  for (const pointIds of membership.values()) {
    count += pointIds.size;
    if (!Number.isSafeInteger(count) || count > 0xffffffff) throw new Error('Point membership exceeds the supported offset range');
  }
  const imageIds = new Float64Array(membership.size);
  const offsets = new Uint32Array(membership.size + 1);
  const pointIds = new BigUint64Array(count);
  let imageIndex = 0;
  let pointIndex = 0;
  for (const [imageId, ids] of membership) {
    if (!Number.isSafeInteger(imageId) || imageId < 0) throw new Error('Invalid point membership image ID');
    imageIds[imageIndex] = imageId;
    offsets[imageIndex++] = pointIndex;
    for (const id of ids) {
      if (id < 0n || id > 0xffffffffffffffffn) throw new Error('Invalid unsigned point membership ID');
      pointIds[pointIndex++] = id;
    }
  }
  offsets[imageIndex] = pointIndex;
  return { imageIds, offsets, pointIds };
}

export function assertCompactPointMembership(value: unknown): asserts value is CompactPointMembership {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid compact point membership');
  const data = value as Partial<CompactPointMembership>;
  if (!(data.imageIds instanceof Float64Array) || !(data.offsets instanceof Uint32Array)
    || !(data.pointIds instanceof BigUint64Array) || data.offsets.length !== data.imageIds.length + 1
    || data.offsets[0] !== 0 || data.offsets[data.imageIds.length] !== data.pointIds.length) {
    throw new Error('Invalid compact point membership arrays');
  }
  const images = new Set<number>();
  for (let i = 0; i < data.imageIds.length; i++) {
    const id = data.imageIds[i];
    if (!Number.isSafeInteger(id) || id < 0 || images.has(id) || data.offsets[i] > data.offsets[i + 1]) {
      throw new Error('Invalid compact point membership offsets or image IDs');
    }
    images.add(id);
  }
}

/** Only `.has` requests allocate boxed IDs. Iteration never builds a Set. */
class MembershipLookupCache {
  private readonly entries = new Map<number, Set<bigint>>();
  private retainedIds = 0;

  has(imageIndex: number, ids: BigUint64Array, start: number, end: number, value: bigint): boolean {
    const count = end - start;
    if (count === 0) return false;
    let lookup = this.entries.get(imageIndex);
    if (lookup) {
      this.entries.delete(imageIndex);
      this.entries.set(imageIndex, lookup);
      return lookup.has(value);
    }
    // The normal renderer uses indexed selection iteration, not `.has`. Bound
    // optional lookups so visiting images cannot recreate the full boxed index.
    if (count > 65536) {
      for (let index = start; index < end; index++) if (ids[index] === value) return true;
      return false;
    }
    while (this.entries.size >= 8 || this.retainedIds + count > 65536) {
      const oldest = this.entries.entries().next().value!;
      this.entries.delete(oldest[0]);
      this.retainedIds -= oldest[1].size;
    }
    lookup = new Set(ids.subarray(start, end));
    this.entries.set(imageIndex, lookup);
    this.retainedIds += lookup.size;
    return lookup.has(value);
  }
}

class PointMembershipView implements ReadonlySet<bigint> {
  readonly [Symbol.toStringTag] = 'Set';
  private readonly ids: BigUint64Array;
  private readonly start: number;
  private readonly end: number;
  private readonly imageIndex: number;
  private readonly lookups: MembershipLookupCache;

  constructor(ids: BigUint64Array, start: number, end: number, imageIndex: number, lookups: MembershipLookupCache) {
    this.ids = ids;
    this.start = start;
    this.end = end;
    this.imageIndex = imageIndex;
    this.lookups = lookups;
  }

  get size(): number { return this.end - this.start; }
  has(value: bigint): boolean { return this.lookups.has(this.imageIndex, this.ids, this.start, this.end, value); }
  *values(): SetIterator<bigint> {
    for (let index = this.start; index < this.end; index++) yield this.ids[index];
  }
  keys(): SetIterator<bigint> { return this.values(); }
  *entries(): SetIterator<[bigint, bigint]> {
    for (const value of this.values()) yield [value, value];
  }
  [Symbol.iterator](): SetIterator<bigint> { return this.values(); }
  forEach(callback: (value: bigint, value2: bigint, set: ReadonlySet<bigint>) => void, thisArg?: unknown): void {
    for (const value of this.values()) callback.call(thisArg, value, value, this);
  }
}

/** Native Map behavior with immutable, insertion-ordered Set views over the transferred buffers. */
export function createPointMembershipViews(data: CompactPointMembership): ImageToPoint3DIdsMap {
  const result: ImageToPoint3DIdsMap = new Map();
  const lookups = new MembershipLookupCache();
  for (let i = 0; i < data.imageIds.length; i++) {
    result.set(data.imageIds[i], new PointMembershipView(data.pointIds, data.offsets[i], data.offsets[i + 1], i, lookups));
  }
  return result;
}

export function pointMembershipTransfers(data: CompactPointMembership): ArrayBuffer[] {
  return [data.imageIds.buffer, data.offsets.buffer, data.pointIds.buffer] as ArrayBuffer[];
}
