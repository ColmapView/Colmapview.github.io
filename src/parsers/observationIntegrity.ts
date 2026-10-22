import type { Image, Point3D, Reconstruction } from '../types/colmap';
import type { WasmReconstructionWrapper } from '../wasm/reconstruction';

export interface ObservationIntegrity {
  status: 'valid' | 'invalid' | 'unavailable';
  checkedTracks: number;
  checkedObservations: number;
  issues: { missingImage: number; invalidIndex: number; conflictingPoint: number; duplicateTrack: number; duplicateImage: number; missingTrack: number; nonfiniteTrackedXY: number };
  example?: string;
}

type TrackVisitor = (pointIndex: number, imageId: number, point2DIdx: number) => void;
export type ObservationVisitor = (index: number, pointId: bigint, x: number, y: number) => void;
interface GraphSource {
  pointCount: number;
  pointId(index: number): bigint;
  tracks(visit: TrackVisitor): void;
  observations(imageId: number, visit: ObservationVisitor): void;
}

export function unavailableObservationIntegrity(reason: string): ObservationIntegrity {
  return { status: 'unavailable', checkedTracks: 0, checkedObservations: 0,
    issues: { missingImage: 0, invalidIndex: 0, conflictingPoint: 0, duplicateTrack: 0, duplicateImage: 0, missingTrack: 0, nonfiniteTrackedXY: 0 }, example: reason };
}

/** Check both directions without materializing the model or retaining boxed observations. */
export function checkObservationGraph(images: ReadonlyMap<number, Image>, source: GraphSource): ObservationIntegrity {
  const result = { ...unavailableObservationIntegrity(''), status: 'valid' as ObservationIntegrity['status'], example: undefined as string | undefined };
  const issue = (kind: keyof ObservationIntegrity['issues'], example: string) => {
    result.status = 'invalid'; result.issues[kind]++; result.example ??= example;
  };
  const imageEntries = [...images.entries()];
  const imageIndices = new Map(imageEntries.map(([id], index) => [id, index]));
  const counts = new Uint32Array(images.size);
  source.tracks((_point, imageId, index) => {
    result.checkedTracks++;
    const imageIndex = imageIndices.get(imageId);
    if (imageIndex === undefined) issue('missingImage', `Track references missing image ${imageId}.`);
    else if (!Number.isInteger(index) || index < 0 || index >= (images.get(imageId)!.numPoints2D ?? images.get(imageId)!.points2D.length)) {
      issue('invalidIndex', `Track references missing feature ${imageId}:${index}.`);
    } else counts[imageIndex]++;
  });
  // Sort packed (feature index, point index) pairs per image. This avoids a
  // marker for every unassociated feature, including multi-gigabyte pose files.
  const offsets = new Float64Array(images.size + 1);
  for (let i = 0; i < counts.length; i++) offsets[i + 1] = offsets[i] + counts[i];
  const seenPoints = new Uint32Array(source.pointCount);
  // At most 64 MiB of pairs per batch, or one image's tracks if it is larger.
  for (let first = 0; first < images.size;) {
    let end = first + 1;
    while (end < images.size && offsets[end + 1] - offsets[first] <= 8 * 1024 * 1024) end++;
    const pairs = new BigUint64Array(offsets[end] - offsets[first]);
    const cursors = offsets.slice(first, end);
    source.tracks((point, imageId, index) => {
      const imageIndex = imageIndices.get(imageId);
      if (imageIndex === undefined || imageIndex < first || imageIndex >= end || !Number.isInteger(index) || index < 0
        || index >= (images.get(imageId)!.numPoints2D ?? images.get(imageId)!.points2D.length)) return;
      pairs[cursors[imageIndex - first]++ - offsets[first]] = BigInt(index) << 32n | BigInt(point);
    });
    for (let imageIndex = first; imageIndex < end; imageIndex++) {
      const [imageId, image] = imageEntries[imageIndex];
      const count = image.numPoints2D ?? image.points2D.length;
      const expected = pairs.subarray(offsets[imageIndex] - offsets[first], offsets[imageIndex + 1] - offsets[first]).sort();
      let previousIndex = -1;
      for (const pair of expected) {
        const index = Number(pair >> 32n), point = Number(pair & 0xffffffffn);
        if (previousIndex === index) issue('duplicateTrack', `More than one track targets feature ${imageId}:${index}.`);
        if (seenPoints[point] === imageIndex + 1) issue('duplicateImage', `Point ${source.pointId(point)} has more than one track in image ${imageId}.`);
        seenPoints[point] = imageIndex + 1; previousIndex = index;
      }
      let observed = 0, track = 0;
      source.observations(imageId, (index, id, x, y) => {
        if (index !== observed++) throw new Error(`Observation indices are unavailable for image ${imageId}.`);
        result.checkedObservations++;
        const associated = id !== -1n && id !== 0xffffffffffffffffn;
        const normalized = BigInt.asUintN(64, id);
        let targeted = false;
        while (track < expected.length && Number(expected[track] >> 32n) === index) {
          targeted = true;
          const pointId = source.pointId(Number(expected[track++] & 0xffffffffn));
          if (!associated || normalized !== pointId) issue('conflictingPoint', `Feature ${imageId}:${index} names point ${id}; its track names ${pointId}.`);
        }
        if (associated && !targeted) issue('missingTrack', `Feature ${imageId}:${index} has no reciprocal point track.`);
        if (associated && (!Number.isFinite(x) || !Number.isFinite(y))) issue('nonfiniteTrackedXY', `Tracked feature ${imageId}:${index} has nonfinite coordinates.`);
      });
      if (observed !== count) throw new Error(`Original observations are unavailable for image ${imageId}.`);
    }
    first = end;
  }
  return result;
}

type GraphWasmSource = Pick<WasmReconstructionWrapper, 'pointCount' | 'getPoint3DIds' | 'getTrackOffsets' | 'getTrackImageIds' | 'getTrackPoint2DIdxs' | 'visitImageObservations'>;

export function checkReconstructionObservations(data: Pick<Reconstruction, 'images' | 'points3D'>, wasm?: GraphWasmSource | null): ObservationIntegrity {
  if (wasm) {
    const ids = wasm.getPoint3DIds(), offsets = wasm.getTrackOffsets();
    const images = wasm.getTrackImageIds(), indices = wasm.getTrackPoint2DIdxs();
    if (wasm.pointCount && (!ids || ids.length !== wasm.pointCount || !offsets || offsets.length !== wasm.pointCount + 1
      || offsets[0] !== 0 || offsets[wasm.pointCount] !== (images?.length ?? 0) || (images?.length ?? 0) !== (indices?.length ?? 0))) {
      throw new Error('Point track arrays are unavailable.');
    }
    if (offsets) for (let point = 0; point < wasm.pointCount; point++) {
      if (offsets[point] > offsets[point + 1] || offsets[point + 1] > (images?.length ?? 0)) throw new Error('Invalid point track offsets.');
    }
    return checkObservationGraph(data.images, {
      pointCount: wasm.pointCount,
      pointId: index => ids![index],
      tracks: visit => {
        for (let point = 0; point < wasm.pointCount; point++) {
          for (let track = offsets![point]; track < offsets![point + 1]; track++) visit(point, images![track], indices![track]);
        }
      },
      observations: (id, visit) => wasm.visitImageObservations(id, visit),
    });
  }
  const points: [bigint, Point3D][] = [...(data.points3D?.entries() ?? [])];
  return checkObservationGraph(data.images, {
    pointCount: points.length,
    pointId: index => points[index][0],
    tracks: visit => points.forEach(([, point], index) => point.track.forEach(track => visit(index, track.imageId, track.point2DIdx))),
    observations: (id, visit) => data.images.get(id)!.points2D.forEach((point, index) => visit(index, point.point3DId, ...point.xy)),
  });
}

export function observationIntegrityWarning(result: ObservationIntegrity): string | null {
  if (result.status === 'valid') return null;
  return result.status === 'invalid'
    ? 'Source feature links are inconsistent. Camera and point viewing remains available; feature matching and COLMAP export are disabled. Use PLY to export point geometry.'
    : 'Source feature links could not be verified. COLMAP export is disabled; use PLY to export point geometry.';
}

export function assertObservationIntegrity(result: ObservationIntegrity): void {
  if (result.status !== 'valid') throw new Error(result.status === 'invalid'
    ? 'Source feature links are inconsistent. COLMAP export is blocked; export PLY for point geometry.'
    : 'Source feature links could not be verified. COLMAP export is blocked; export PLY for point geometry.');
}

export function assertReconstructionObservationIntegrity(data: Pick<Reconstruction, 'images' | 'points3D'>, wasm?: GraphWasmSource | null): void {
  assertObservationIntegrity(checkReconstructionObservations(data, wasm));
}
