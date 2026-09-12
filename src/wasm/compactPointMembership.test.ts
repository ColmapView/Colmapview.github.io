import { describe, expect, it } from 'vitest';
import { assertCompactPointMembership, buildPointMembershipFromWasm, createPointMembershipViews, packPointMembership, pointMembershipTransfers } from './compactPointMembership';
import { buildImage, buildPoint3D, buildWasmReconstructionWrapper } from '../test/builders';
import { computeImageStats, computeImageStatsFromWasm } from '../parsers/imageStats';

const bigId = 9007199254740997n;
const maximumId = 0xffffffffffffffffn;

function trackSource(ids: bigint[] | null, tracks: number[][]) {
  const offsets = [0];
  for (const track of tracks) offsets.push(offsets.at(-1)! + track.length);
  return buildWasmReconstructionWrapper({
    pointCount: tracks.length,
    errors: Float32Array.from(tracks, (_, index) => index % 2 ? -1 : 0.5),
    point3DIds: ids ? BigUint64Array.from(ids) : null,
    trackOffsets: Uint32Array.from(offsets),
    trackImageIds: Uint32Array.from(tracks.flat()),
  });
}

function membershipEntries(value: ReturnType<typeof createPointMembershipViews>) {
  return [...value].map(([imageId, ids]) => [imageId, [...ids]]);
}

describe('direct WASM CSR reverse membership', () => {
  it.each([
    [73n, bigId, maximumId],
    [maximumId, 73n, bigId],
  ])('matches Map and WASM Set membership for sorted or unsorted sparse IDs: %s', (...ids) => {
    const images = new Map([42, 7, 91].map(id => [id, buildImage({ imageId: id })]));
    const tracks = [[42, 7, 42, 999], [42, 42, 7, 7], []];
    const wasm = trackSource(ids, tracks);
    const originalOffsets = wasm.getTrackOffsets()!.slice();
    const originalIds = wasm.getPoint3DIds()!.slice();
    const reference = computeImageStatsFromWasm(images, wasm);
    const mapPoints = new Map(ids.map((id, index) => [id, buildPoint3D({
      point3DId: id, error: index % 2 ? -1 : 0.5,
      track: tracks[index].map((imageId, point2DIdx) => ({ imageId, point2DIdx })),
    })]));
    expect(reference).toEqual(computeImageStats(images, mapPoints));
    const packed = buildPointMembershipFromWasm(images, wasm);
    assertCompactPointMembership(packed);
    const views = createPointMembershipViews(packed);
    expect(membershipEntries(views)).toEqual(membershipEntries(reference.imageToPoint3DIds));
    expect([...views.get(42)!]).toEqual([ids[0], ids[1]]);
    expect(views.get(42)!.size).toBe(2);
    expect(views.get(91)!.size).toBe(0);
    expect(views.has(999)).toBe(false);
    expect(wasm.getTrackOffsets()).toEqual(originalOffsets);
    expect(wasm.getPoint3DIds()).toEqual(originalIds);
    const moved = structuredClone(packed, { transfer: pointMembershipTransfers(packed) });
    expect(packed.pointIds.byteLength).toBe(0);
    expect([...createPointMembershipViews(moved).get(7)!]).toEqual([ids[0], ids[1]]);
    expect(wasm.getPoint3DIds()).toEqual(originalIds);
  });

  it('preserves Set semantics for duplicate point records accepted by the legacy binary parser', () => {
    const images = new Map([7, 42].map(id => [id, buildImage({ imageId: id })]));
    const source = trackSource([bigId, 73n, bigId], [[7, 7], [7, 42], [7, 42, 42]]);
    const views = createPointMembershipViews(buildPointMembershipFromWasm(images, source));
    expect(membershipEntries(views)).toEqual(membershipEntries(computeImageStatsFromWasm(images, source).imageToPoint3DIds));
    expect([...views.get(7)!]).toEqual([bigId, 73n]);
    expect([...views.get(42)!]).toEqual([73n, bigId]);
  });

  it('supports empty and unknown-only tracks and preserves the legacy missing-ID fallback', () => {
    const images = new Map([[7, buildImage({ imageId: 7 })]]);
    expect(membershipEntries(createPointMembershipViews(buildPointMembershipFromWasm(images, trackSource([], []))))).toEqual([[7, []]]);
    expect(membershipEntries(createPointMembershipViews(buildPointMembershipFromWasm(images, trackSource([bigId], [[999]]))))).toEqual([[7, []]]);
    expect(createPointMembershipViews(buildPointMembershipFromWasm(new Map(), trackSource([bigId], [[7]]))).size).toBe(0);
    expect([...createPointMembershipViews(buildPointMembershipFromWasm(images, trackSource(null, [[7], [], [7, 7]]))).get(7)!]).toEqual([1n, 3n]);
  });

  it('rejects invalid CSR boundaries instead of writing truncated membership', () => {
    const images = new Map([[7, buildImage({ imageId: 7 })]]);
    const invalid = buildWasmReconstructionWrapper({ pointCount: 2, trackOffsets: new Uint32Array([0, 2, 1]), trackImageIds: new Uint32Array([7]) });
    expect(() => buildPointMembershipFromWasm(images, invalid)).toThrow('offsets');
    expect(() => buildPointMembershipFromWasm(images, buildWasmReconstructionWrapper({ pointCount: 1 }))).toThrow('arrays');
    expect(() => buildPointMembershipFromWasm(images, buildWasmReconstructionWrapper({ pointCount: 0x100000000 }))).toThrow('point count');
  });
});

describe('compact reverse point membership', () => {
  it('preserves native Map lookup and the complete read-only Set interface without changing ID or iteration order', () => {
    const source = new Map([
      [4294967311, new Set([bigId, 0n, maximumId, 73n])],
      [7, new Set<bigint>()],
    ]);
    const packed = packPointMembership(source);
    assertCompactPointMembership(packed);
    const views = createPointMembershipViews(packed);
    expect(views).toBeInstanceOf(Map);
    expect(views.size).toBe(2);
    expect([...views.keys()]).toEqual([...source.keys()]);
    expect(views.get(1)).toBeUndefined();
    const view = views.get(4294967311)!;
    expect(view).toBe(views.get(4294967311));
    expect(view).not.toBeInstanceOf(Set);
    expect(view.size).toBe(4);
    expect([...view]).toEqual([bigId, 0n, maximumId, 73n]);
    expect([...view.values()]).toEqual([...source.get(4294967311)!]);
    expect([...view.keys()]).toEqual([...view]);
    expect([...view.entries()]).toEqual([...source.get(4294967311)!.entries()]);
    expect(view.has(bigId)).toBe(true);
    expect(view.has(BigInt(Number(bigId)))).toBe(false);
    expect(view.has(maximumId)).toBe(true);
    expect(view.has(-1n)).toBe(false);
    expect(views.get(7)!.size).toBe(0);
    expect([...views.get(7)!]).toEqual([]);
    expect(views.get(7)!.has(bigId)).toBe(false);
    const context = { seen: [] as bigint[] };
    view.forEach(function (this: typeof context, value, repeated, set) {
      expect(repeated).toBe(value);
      expect(set).toBe(view);
      this.seen.push(value);
    }, context);
    expect(context.seen).toEqual([...view]);
    expect('add' in view).toBe(false);
    expect('delete' in view).toBe(false);
    expect('clear' in view).toBe(false);
  });

  it('transfers the compact buffers without detaching or mutating source sets', () => {
    const ids = new Set([bigId, 73n]);
    const packed = packPointMembership(new Map([[42, ids]]));
    const moved = structuredClone(packed, { transfer: pointMembershipTransfers(packed) });
    expect(packed.imageIds.byteLength + packed.offsets.byteLength + packed.pointIds.byteLength).toBe(0);
    expect([...ids]).toEqual([bigId, 73n]);
    expect([...createPointMembershipViews(moved).get(42)!]).toEqual([bigId, 73n]);
  });

  it('keeps membership correct after lookup-cache eviction and for oversized images', () => {
    const source = new Map<number, Set<bigint>>();
    for (let i = 0; i < 10; i++) source.set(i, new Set([bigId + BigInt(i)]));
    source.set(10, new Set(Array.from({ length: 65537 }, (_, index) => bigId + BigInt(index))));
    const views = createPointMembershipViews(packPointMembership(source));
    for (const [image, ids] of source) for (const id of [ids.values().next().value!]) expect(views.get(image)!.has(id)).toBe(true);
    expect(views.get(0)!.has(bigId)).toBe(true);
    expect(views.get(10)!.has(bigId + 65536n)).toBe(true);
    expect(views.get(10)!.has(bigId + 65537n)).toBe(false);
    expect(views.get(10)!.size).toBe(65537);
  });

  it('handles an empty reconstruction and rejects malformed offsets, IDs and uint32 overflow', () => {
    const empty = packPointMembership(new Map());
    assertCompactPointMembership(empty);
    expect(createPointMembershipViews(empty).size).toBe(0);
    expect([...empty.offsets]).toEqual([0]);
    expect(() => packPointMembership(new Map([[1, new Set([-1n])]]))).toThrow('unsigned');
    expect(() => packPointMembership(new Map([[1, new Set([maximumId + 1n])]]))).toThrow('unsigned');
    expect(() => packPointMembership(new Map([[-1, new Set<bigint>()]]))).toThrow('image ID');
    expect(() => packPointMembership(new Map([[1, { size: 0x100000000 } as ReadonlySet<bigint>]]))).toThrow('offset range');
    const packed = packPointMembership(new Map([[1, new Set([bigId])], [2, new Set([73n])]]));
    expect(() => assertCompactPointMembership({ ...packed, offsets: new Uint32Array([0, 3, 2]) })).toThrow();
    expect(() => assertCompactPointMembership({ ...packed, offsets: new Uint32Array([1, 1, 2]) })).toThrow();
    expect(() => assertCompactPointMembership({ ...packed, imageIds: new Float64Array([1, 1]) })).toThrow();
    expect(() => assertCompactPointMembership({ ...packed, imageIds: new Float64Array([1, 1.5]) })).toThrow();
  });
});
